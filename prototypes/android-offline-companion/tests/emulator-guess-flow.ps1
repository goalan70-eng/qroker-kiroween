param(
    [string]$Adb = 'D:/Android/Sdk/platform-tools/adb.exe',
    [string]$Apk = 'dist/QRoker-Offline.apk',
    [int]$AdbServerPort = 5062,
    [string]$Serial = '127.0.0.1:5623',
    [ValidateSet("QRokerGuessIsolated", "QRokerFrames")][string]$AvdName = "QRokerGuessIsolated",
    [string]$EvidenceDir = "build/guess-flow",
    [switch]$DuplicateOnly
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$package = 'com.qroker.offline'
$activity = "$package/.MainActivity"
$outputDirectory = (Resolve-Path $EvidenceDir).Path
$windowPath = '/data/local/tmp/qroker-guess-window.xml'
$clock = [System.Diagnostics.Stopwatch]::new()
$evidence = [System.Collections.Generic.List[string]]::new()
$edit = '//node[@class="android.widget.EditText"]'
$ready = '//node[@text="1회차 예측"]'
$waiting = '//node[@text="네 장이 만나는 가운데 무늬를 비춰 주세요."]'
$duplicate = '//node[starts-with(@text,"이미 기록한 조합입니다")]'
$confirm = '//node[@text="확정"]'
$scan = '//node[@text="코드 인식"]'
$roundEntries = '//node[contains(@content-desc,"회차, 획득 ")]'

function Invoke-Device([string[]]$Command) {
    $result = & $Adb -P $AdbServerPort -s $Serial @Command
    if ($LASTEXITCODE -ne 0) { throw "ADB command failed: $Command" }
    $result
}

function Mark([string]$Text) {
    $line = '{0:F1}s  {1}' -f $clock.Elapsed.TotalSeconds, $Text
    $evidence.Add($line)
    Write-Host $line
}

function Read-View {
    $dump = Invoke-Device @('shell','uiautomator','dump',$windowPath)
    if (($dump -join ' ') -notmatch 'dumped to:') { return [xml]'<hierarchy/>' }
    [xml]((Invoke-Device @('shell','cat',$windowPath)) -join '')
}

function Wait-View([string]$Predicate, [int]$Timeout = 60) {
    $elapsed = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $view = Read-View
        if ($view.SelectSingleNode($Predicate)) { return $view }
        Start-Sleep -Milliseconds 200
    } while ($elapsed.Elapsed.TotalSeconds -lt $Timeout)
    throw "Timed out waiting for $Predicate"
}

function Save-View([xml]$View, [string]$Name) {
    $View.Save((Join-Path $outputDirectory "$Name.xml"))
    & $Adb -P $AdbServerPort -s $Serial exec-out screencap -p > (Join-Path $outputDirectory "$Name.png")
}

function Tap-Node($Node) {
    if (!$Node) { throw 'Expected UI action is absent' }
    $edges = [regex]::Matches($Node.bounds,'\d+') | ForEach-Object {[int]$_.Value}
    Invoke-Device @('shell','input','tap',[string][int](($edges[0] + $edges[2]) / 2),
        [string][int](($edges[1] + $edges[3]) / 2)) | Out-Null
}

function Enter-Draft([xml]$View, [int]$Value) {
    Tap-Node ($View.SelectSingleNode($edit))
    Invoke-Device @('shell','input','text',[string]$Value) | Out-Null
    Wait-View "//node[@class='android.widget.EditText' and @text='$Value']" 10
}

function Assert-Score([xml]$View, [int]$Total, [int]$Rounds) {
    if (!$View.SelectSingleNode("//node[@text='총점 ${Total}점']") -or
        $View.SelectNodes($roundEntries).Count -ne $Rounds) { throw "Expected $Rounds rounds and $Total points" }
}

function Assert-DraftCleared([xml]$View) {
    $field = $View.SelectSingleNode($edit)
    if (!$field -or ($field.text -ne '' -and $field.text -ne $field.hint -and $field.text -ne '예측 합계 (4~52)')) {
        throw "Replacement/recovery left a previous guess in the input: $($field.text)"
    }
    if (!$View.SelectSingleNode('//node[@text="1회차 예측"]')) { throw 'A round was recorded before submission' }
}

function Assert-InputClosed([xml]$View, [int]$Total = 0, [int]$Rounds = 0) {
    if ($View.SelectSingleNode($edit) -or $View.SelectSingleNode($confirm)) { throw 'Guess controls remain visible' }
    Assert-Score $View $Total $Rounds
}

try {
    if ((Invoke-Device @('shell','getprop','ro.boot.qemu.avd_name')) -ne $AvdName) {
        throw 'Unexpected AVD'
    }
    if ((Invoke-Device @('shell','getprop','sys.boot_completed')) -ne '1') { throw 'Test AVD is still booting' }
    Invoke-Device @('shell','cmd','connectivity','airplane-mode','enable') | Out-Null
    Invoke-Device @('shell','svc','wifi','disable') | Out-Null
    if ((Invoke-Device @('shell','settings','get','global','airplane_mode_on')) -ne '1' -or
        (Invoke-Device @('shell','settings','get','global','wifi_on')) -ne '0') { throw 'AVD is not offline' }
    Invoke-Device @('shell','wm','dismiss-keyguard') | Out-Null
    Invoke-Device @('install','-r','-g',$Apk) | Out-Host
    Invoke-Device @('shell','am','force-stop',$package) | Out-Null
    $clock.Start()
    Mark ("APK SHA-256: " + (Get-FileHash -LiteralPath $Apk).Hash.ToLowerInvariant())
    Invoke-Device @('shell','am','start','-W','-n',$activity) | Out-Host

    $homeView = Wait-View $scan
    Assert-InputClosed $homeView
    if ($homeView.SelectSingleNode('//node[contains(@content-desc,"카메라 미리보기")]')) { throw 'Camera visible on launch' }
    Save-View $homeView 'scoreboard-empty'
    Tap-Node ($homeView.SelectSingleNode($scan))
    $opening = Wait-View $ready
    Assert-DraftCleared $opening
    Save-View $opening 'prediction-popup'

    if ($DuplicateOnly) {
        $typed = Enter-Draft $opening 27
        Tap-Node ($typed.SelectSingleNode($confirm))
        $scored = Wait-View '//node[@text="총점 10점"]' 15
        Assert-InputClosed $scored 10 1
        if (!$scored.SelectSingleNode('//node[contains(@text,"내 예측 27") and contains(@text,"정답 27")]')) {
            throw 'Result missing from scoreboard'
        }
        Save-View $scored 'scoreboard-first'
        Tap-Node ($scored.SelectSingleNode($scan))
        $blocked = Wait-View $duplicate
        if ($blocked.SelectSingleNode($edit)) { throw 'Recorded code reopened a prediction' }
        Save-View $blocked 'duplicate-blocked'
        Invoke-Device @('shell','am','force-stop',$package) | Out-Null
        Invoke-Device @('shell','am','start','-W','-n',$activity) | Out-Host
        $restored = Wait-View $scan
        Assert-InputClosed $restored 10 1
        Tap-Node ($restored.SelectSingleNode($scan))
        $blocked = Wait-View $duplicate
        if ($blocked.SelectSingleNode($edit)) { throw 'Duplicate reopened after restart' }
        Tap-Node ($blocked.SelectSingleNode('//node[@text="점수판으로"]'))
        $homeView = Wait-View $scan
        Assert-InputClosed $homeView 10 1
        Tap-Node ($homeView.SelectSingleNode('//node[@content-desc="점수판 메뉴"]'))
        $menu = Wait-View '//node[@text="새 게임"]'
        Tap-Node ($menu.SelectSingleNode('//node[@text="새 게임"]'))
        $question = Wait-View '//node[@text="새 게임을 시작할까요?"]'
        Tap-Node ($question.SelectSingleNode('//node[@text="새 게임"]'))
        $homeView = Wait-View $scan
        Assert-InputClosed $homeView
        Tap-Node ($homeView.SelectSingleNode($scan))
        $first = Wait-View $ready
        Assert-DraftCleared $first
        Tap-Node ($first.SelectSingleNode('//node[@text="취소"]'))
        Assert-InputClosed (Wait-View $scan)
        Mark 'PASS on-demand scan, popup, score posted once, duplicates blocked across restart, same code allowed in a new game'
        return
    }

    $typed = Enter-Draft $opening 27
    $missing = Wait-View $waiting
    if ($missing.SelectSingleNode($edit)) { throw 'Draft remained open after removal' }
    Invoke-Device @('shell','input','keyevent','66') | Out-Null
    $again = Wait-View $ready
    Assert-DraftCleared $again
    $typed = Enter-Draft $again 26
    $empty = '//node[@class="android.widget.EditText" and (@text="" or @text="예측 합계 (4~52)")]'
    $changed = Wait-View $empty
    Assert-DraftCleared $changed
    $typed = Enter-Draft $changed 49
    $covered = Wait-View $waiting
    if ($covered.SelectSingleNode($edit)) { throw 'Input remained open while covered' }
    $recovered = Wait-View $ready
    Assert-DraftCleared $recovered
    Tap-Node ($recovered.SelectSingleNode('//node[@text="취소"]'))
    Assert-InputClosed (Wait-View $scan)
    Mark 'PASS removal, replacement, occlusion and cancelled popup leave no score or stale input'
} catch {
    Mark ("FAIL " + $_.Exception.Message)
    throw
} finally {
    $log = if ($DuplicateOnly) { 'emulator-duplicate.txt' } else { 'emulator-guess-flow.txt' }
    $evidence | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $outputDirectory $log)
}
