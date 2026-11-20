param(
    [string]$Adb = 'D:/Android/Sdk/platform-tools/adb.exe',
    [string]$Apk = 'dist/QRoker-Offline.apk',
    [int]$AdbServerPort = 5062,
    [string]$Serial = '127.0.0.1:5623',
    [switch]$DuplicateOnly
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$package = 'com.qroker.offline'
$activity = "$package/.MainActivity"
$outputDirectory = (Resolve-Path 'build/guess-flow').Path
$screenPath = Join-Path $outputDirectory 'screen.png'
$windowPath = '/data/local/tmp/qroker-guess-window.xml'
$clock = [System.Diagnostics.Stopwatch]::new()
$evidence = [System.Collections.Generic.List[string]]::new()
$palette = @(0xe33131, 0x32cb49, 0x3464ed, 0xe5d62b, 0xd23bd8, 0x2fdadd)
$edit = '//node[@class="android.widget.EditText"]'
$ready = '//node[@text="카드 네 장을 읽었습니다"]'
$waiting = '//node[@text="카드 네 장의 모서리를 맞대세요"]'
$duplicate = '//node[@text="이미 기록한 조합입니다"]'
$confirm = '//node[@text="확정"]'
$roundEntries = '//node[contains(@text,"번째   예측 ")]'

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
    Invoke-Device @('shell','uiautomator','dump',$windowPath) | Out-Null
    [xml]((Invoke-Device @('shell','cat',$windowPath)) -join '')
}

function Get-Scene {
    & $Adb -P $AdbServerPort -s $Serial exec-out screencap -p > $screenPath
    if ($LASTEXITCODE -ne 0) { throw 'Could not read emulator screenshot' }
    $image = [System.Drawing.Bitmap]::new($screenPath)
    try {
        $counts = [int[]]::new($palette.Count)
        for ($y = [int]($image.Height * .13); $y -lt $image.Height * .50; $y += 6) {
            for ($x = [int]($image.Width * .17); $x -lt $image.Width * .83; $x += 6) {
                $pixel = $image.GetPixel($x, $y)
                $low = [Math]::Min([Math]::Min($pixel.R, $pixel.G), $pixel.B)
                $high = [Math]::Max([Math]::Max($pixel.R, $pixel.G), $pixel.B)
                if (($high - $low) -lt 80) { continue }
                $best = 6400
                $matched = -1
                for ($i = 0; $i -lt $palette.Count; $i++) {
                    $r = $pixel.R - ($palette[$i] -shr 16)
                    $g = $pixel.G - (($palette[$i] -shr 8) -band 255)
                    $b = $pixel.B - ($palette[$i] -band 255)
                    $distance = $r * $r + $g * $g + $b * $b
                    if ($distance -lt $best) { $best = $distance; $matched = $i }
                }
                if ($matched -ge 0) { $counts[$matched]++ }
            }
        }
        $peak = 11
        $scene = 0
        for ($i = 0; $i -lt $counts.Length; $i++) {
            if ($counts[$i] -gt $peak) { $peak = $counts[$i]; $scene = $i + 1 }
        }
        return $scene
    } finally {
        $image.Dispose()
    }
}

function Wait-Scene([int]$Scene, [string]$Predicate, [int]$Timeout = 55) {
    $deadline = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $seen = Get-Scene
        if ($seen -eq $Scene) {
            $view = Read-View
            if ($view.SelectSingleNode($Predicate) -and (Get-Scene) -eq $Scene) { return $view }
        }
        Start-Sleep -Milliseconds 300
    } while ($deadline.Elapsed.TotalSeconds -lt $Timeout)
    throw "Timed out waiting for scene $Scene, $Predicate. Last cue was $seen"
}

function Save-View([xml]$View, [string]$Name) {
    $View.Save((Join-Path $outputDirectory "$Name.xml"))
}

function Tap-Node($Node) {
    if (!$Node) { throw 'Expected UI action is absent' }
    $edges = [regex]::Matches($Node.bounds,'\d+') | ForEach-Object {[int]$_.Value}
    Invoke-Device @('shell','input','tap',[string][int](($edges[0] + $edges[2]) / 2),
        [string][int](($edges[1] + $edges[3]) / 2)) | Out-Null
}

function Enter-Draft([xml]$View, [int]$Value, [int]$Scene) {
    for ($attempt = 0; $attempt -lt 2; $attempt++) {
        if ((Get-Scene) -ne $Scene) { throw "Scene $Scene ended before typing $Value" }
        $field = $View.SelectSingleNode($edit)
        if (!$field) { throw "Scene $Scene has no field for $Value" }
        if ($field.text -eq [string]$Value) { return $View }
        if ($field.text -ne '' -and $field.text -ne $field.hint) { throw "Unexpected input: $($field.text)" }
        if ($field.focused -ne 'true') {
            Tap-Node $field
            Start-Sleep -Milliseconds 600
        }
        Invoke-Device @('shell','input','text',[string]$Value) | Out-Null
        $View = Read-View
        $field = $View.SelectSingleNode($edit)
        if ($field.text -eq [string]$Value -and (Get-Scene) -eq $Scene) { return $View }
        Mark "Input attempt $($attempt + 1) for scene $Scene displayed '$($field.text)'"
    }
    throw "Could not verify draft $Value in scene $Scene"
}

function Assert-Score([xml]$View, [int]$Total, [int]$Rounds) {
    if (!$View.SelectSingleNode("//node[@text='총점 ${Total}점']") -or
        $View.SelectNodes($roundEntries).Count -ne $Rounds) { throw "Expected $Rounds rounds and $Total points" }
}

function Assert-DraftCleared([xml]$View) {
    $field = $View.SelectSingleNode($edit)
    if (!$field -or ($field.text -ne '' -and $field.text -ne $field.hint)) {
        throw "Replacement/recovery left a previous guess in the input: $($field.text)"
    }
    if (!$View.SelectSingleNode('//node[@text="1번째 추측"]')) { throw 'A round was recorded before submission' }
    Assert-Score $View 0 0
}

function Assert-InputClosed([xml]$View, [int]$Total = 0, [int]$Rounds = 0) {
    if ($View.SelectSingleNode($edit) -or $View.SelectSingleNode($confirm)) { throw 'Guess controls remain visible' }
    Assert-Score $View $Total $Rounds
}

try {
    if ((Invoke-Device @('shell','getprop','ro.boot.qemu.avd_name')) -ne 'QRokerGuessIsolated') {
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

    $opening = Wait-Scene 1 $ready 28
    Assert-DraftCleared $opening
    if ($DuplicateOnly) {
        # Keep focusing, typing and submitting together on the guest so that no
        # accessibility snapshot runs between the hardware key events.
        for ($tryScore = 0; $tryScore -lt 4; $tryScore++) {
            if ((Get-Scene) -ne 1) { throw 'Initial scene ended before scoring' }
            $field = $opening.SelectSingleNode($edit)
            if (!$field) { throw 'Initial scene lost the guess control' }
            $edges = [regex]::Matches($field.bounds, '\d+') | ForEach-Object {[int]$_.Value}
            $x = [int](($edges[0] + $edges[2]) / 2)
            $y = [int](($edges[1] + $edges[3]) / 2)
            Invoke-Device @('shell',"input tap $x $y; sleep 0.25; input keyevent 9 14 66") | Out-Null
            $opening = Read-View
            if ($opening.SelectSingleNode("//node[@text='총점 10점']")) { break }
        }
        Assert-Score $opening 10 1
        Assert-InputClosed (Wait-Scene 2 $waiting) 10 1
        $reappeared = Wait-Scene 3 $duplicate
        Assert-InputClosed $reappeared 10 1
        Save-View $reappeared 'duplicate-reappeared'
        Mark 'PASS a scored group reappears after removal with one round and 10 points'
        Invoke-Device @('shell','am','force-stop',$package) | Out-Null
        Invoke-Device @('shell','am','start','-W','-n',$activity) | Out-Host
        $restored = Wait-Scene 1 $duplicate 27
        Assert-InputClosed $restored 10 1
        if (!$restored.SelectSingleNode('//node[contains(@text,"예측 27") and contains(@text,"정답 27")]')) {
            throw 'The remembered round was not restored'
        }
        Save-View $restored 'duplicate-after-restart'
        Mark 'PASS restart restores the recorded round and still blocks scoring the same group'
        return
    }
    $draft = Enter-Draft $opening 27 1
    Save-View $draft 'removal-draft'
    Mark 'Draft 27 is visible in the first four-card scene'
    $missing = Wait-Scene 2 $waiting
    Assert-InputClosed $missing
    Tap-Node ($draft.SelectSingleNode($confirm))
    Invoke-Device @('shell','input','keyevent','66') | Out-Null
    $missing = Wait-Scene 2 $waiting 14
    Assert-InputClosed $missing
    Save-View $missing 'removed-no-score'
    Mark 'PASS removal during entry closes the controls and produces no record after stale submit attempts'

    $firstAgain = Wait-Scene 3 $ready
    Assert-DraftCleared $firstAgain
    $draft = Enter-Draft $firstAgain 26 3
    Save-View $draft 'replacement-draft'
    Mark 'Draft 26 is visible in the pre-replacement scene'
    $second = Wait-Scene 4 $ready
    Assert-DraftCleared $second
    Tap-Node ($second.SelectSingleNode($confirm))
    $afterTap = Wait-Scene 4 $ready 14
    Assert-DraftCleared $afterTap
    Save-View $afterTap 'replacement-no-score'
    Mark 'PASS a different complete group opens an empty field and an empty confirm produces no record'

    $draft = Enter-Draft $afterTap 49 4
    Save-View $draft 'occlusion-draft'
    $covered = Wait-Scene 5 $waiting
    Assert-InputClosed $covered
    Save-View $covered 'covered-no-score'
    $recovered = Wait-Scene 6 $ready
    Assert-DraftCleared $recovered
    Save-View $recovered 'recovered-no-score'
    Mark 'PASS temporary occlusion hides the field and recovery never submits the earlier draft'
} catch {
    Mark ("FAIL " + $_.Exception.Message)
    throw
} finally {
    $log = if ($DuplicateOnly) { 'emulator-duplicate.txt' } else { 'emulator-guess-flow.txt' }
    $evidence | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $outputDirectory $log)
}
