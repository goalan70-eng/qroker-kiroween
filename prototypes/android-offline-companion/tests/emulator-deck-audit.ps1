param([string]$Adb = 'D:/Android/Sdk/platform-tools/adb.exe')

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$qrSerial = 'emulator-5560'
$qrPackage = 'com.qroker.offline'
$qrActivity = "$qrPackage/.MainActivity"
$qrUi = '/data/local/tmp/qroker-deck-window.xml'
$qrClock = [System.Diagnostics.Stopwatch]::new()
$qrEvidence = [System.Collections.Generic.List[string]]::new()

function Device([string[]]$Command) {
    $output = & $Adb -s $qrSerial @Command
    if ($LASTEXITCODE -ne 0) { throw "ADB command failed: $Command" }
    $output
}

function Mark([string]$Text) {
    $line = ('{0:F1}s  {1}' -f $qrClock.Elapsed.TotalSeconds, $Text)
    $qrEvidence.Add($line)
    Write-Host $line
}

function Read-View {
    $dump = Device @('shell','uiautomator','dump',$qrUi)
    if (($dump -join ' ') -notmatch 'dumped to:') { return [xml]'<hierarchy/>' }
    [xml]((Device @('shell','cat',$qrUi)) -join '')
}

function Wait-View([string]$Predicate, [int]$Timeout = 30) {
    $wait = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $view = Read-View
        if ($view.SelectSingleNode($Predicate)) { return $view }
    } while ($wait.Elapsed.TotalSeconds -lt $Timeout)
    $labels = ($view.SelectNodes('//node[@text!=""]') | ForEach-Object {$_.text}) -join ' / '
    throw "Timed out waiting for $Predicate. Last screen: $labels"
}

function Tap-Node($Node) {
    if (!$Node) { throw 'Expected UI action is absent' }
    $edges = [regex]::Matches($Node.bounds,'\d+') | ForEach-Object {[int]$_.Value}
    Device @('shell','input','tap',[string][int](($edges[0]+$edges[2])/2),
        [string][int](($edges[1]+$edges[3])/2)) | Out-Null
}

function Submit-Guess([xml]$View, [int]$Value) {
    Tap-Node ($View.SelectSingleNode('//node[@class="android.widget.EditText"]'))
    Wait-View '//node[@class="android.widget.EditText" and @focused="true"]' 10 | Out-Null
    Device @('shell','input','text',[string]$Value) | Out-Null
    $typed = Wait-View "//node[@class='android.widget.EditText' and @text='$Value']" 10
    Tap-Node ($typed.SelectSingleNode('//node[@text="확정"]'))
}

function Save-View([xml]$View, [string]$Name) {
    $View.Save((Join-Path (Get-Location) "build/deck-audit/$Name.xml"))
}

try {
    $qrName = Device @('emu','avd','name')
    if ($qrName -notcontains 'QRokerAudit') { throw "Unexpected AVD: $qrName" }
    if ((Device @('shell','getprop','sys.boot_completed')) -ne '1') { throw 'Test AVD is still booting' }
    Device @('shell','cmd','connectivity','airplane-mode','enable') | Out-Null
    Device @('shell','svc','wifi','disable') | Out-Null
    if ((Device @('shell','settings','get','global','airplane_mode_on')) -ne '1') { throw 'Could not enable airplane mode' }
    if ((Device @('shell','settings','get','global','wifi_on')) -ne '0') { throw 'Could not disable Wi-Fi' }
    Device @('shell','wm','dismiss-keyguard') | Out-Null
    Device @('install','-r','-g','dist/QRoker-Offline.apk') | Out-Host
    Device @('shell','am','force-stop',$qrPackage) | Out-Null
    $qrClock.Start()
    Device @('shell','am','start','-W','-n',$qrActivity) | Out-Host
    $homeView = Wait-View '//node[@text="코드 인식"]' 20
    if (!$homeView.SelectSingleNode('//node[@text="총점 0점"]')) { throw 'Expected a fresh scoreboard' }
    Tap-Node ($homeView.SelectSingleNode('//node[@text="코드 인식"]'))
    $first = Wait-View '//node[@text="1회차 예측"]' 27
    if ($first.SelectSingleNode('//node[contains(@text,"정답")]')) { throw 'Answer exposed in prediction' }
    Mark 'PASS first four-card group opens guessing with the answer hidden'
    Save-View $first 'first-ready'
    Submit-Guess $first 27
    $scored = Wait-View '//node[@text="총점 10점"]' 17
    if (!$scored.SelectSingleNode('//node[contains(@text,"정답 27") and contains(@text,"+10점")]')) {
        throw 'First score or answer was incorrect'
    }
    Mark 'PASS four cards sum to 27 and award 10 points'
    Save-View $scored 'first-scored'
    Tap-Node ($scored.SelectSingleNode('//node[@text="코드 인식"]'))
    Wait-View '//node[starts-with(@text,"이미 기록한 조합입니다")]' 30 | Out-Null
    $missing = Wait-View '//node[@text="네 장이 만나는 가운데 무늬를 비춰 주세요."]' 68
    $missingAgain = Read-View
    foreach ($view in @($missing, $missingAgain)) {
        if (!$view.SelectSingleNode('//node[@text="네 장이 만나는 가운데 무늬를 비춰 주세요."]') -or
            $view.SelectSingleNode('//node[@class="android.widget.EditText"]')) {
            throw 'Missing-card scene exposes a guess or alters the score'
        }
    }
    Mark 'PASS frame sequence with a card missing offers no guess and retains 10 recorded points'
    Save-View $missing 'missing-after-score'
    $second = Wait-View '//node[@text="2회차 예측"]' 40
    Save-View $second 'second-ready'
    Submit-Guess $second 49
    $combined = Wait-View '//node[@text="총점 13점"]' 15
    if (!$combined.SelectSingleNode('//node[contains(@text,"정답 52") and contains(@text,"+3점")]')) {
        throw 'Second score or answer was incorrect'
    }
    Mark 'PASS four kings sum to 52, guess 49 awards 3 points, total is 13'
    Save-View $combined 'second-scored'
    Device @('shell','am','force-stop',$qrPackage) | Out-Null
    Device @('shell','am','start','-W','-n',$qrActivity) | Out-Host
    $restored = Wait-View '//node[@text="총점 13점"]' 14
    if (!$restored.SelectSingleNode('//node[@content-desc="1회차, 획득 10점, 누계 10점"]') -or
        !$restored.SelectSingleNode('//node[@content-desc="2회차, 획득 3점, 누계 13점"]')) {
        throw 'Round history was not restored'
    }
    Mark 'PASS process restart restores both rounds and 13 total points'
    Save-View $restored 'restored'
} catch {
    Mark ("FAIL " + $_.Exception.Message)
    throw
} finally {
    $qrEvidence | Set-Content -Encoding UTF8 -LiteralPath 'build/deck-audit/emulator-results.txt'
}
