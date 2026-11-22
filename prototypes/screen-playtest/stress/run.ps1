param(
    [Parameter(Mandatory)][string]$PriorDeck,
    [Parameter(Mandatory)][string]$PriorClasses,
    [Parameter(Mandatory)][string]$CurrentDeck,
    [string]$Jdk = 'D:/Android/Android Studio1/jbr',
    [string]$BrowserEvidence = '',
    [string]$IsolationEvidence = ''
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$priorDeckPath = (Resolve-Path -LiteralPath $PriorDeck).Path
$priorClassesPath = (Resolve-Path -LiteralPath $PriorClasses).Path
$currentDeckPath = (Resolve-Path -LiteralPath $CurrentDeck).Path
$currentClasses = (Resolve-Path "$root/android-build/jvm").Path
if (!$BrowserEvidence) { $BrowserEvidence = "$root/evidence" }
if (!$IsolationEvidence) { $IsolationEvidence = "$root/evidence/marker-isolation" }
$browserEvidencePath = (Resolve-Path -LiteralPath $BrowserEvidence).Path
$isolationEvidencePath = (Resolve-Path -LiteralPath $IsolationEvidence).Path
$bin = "$Jdk/bin"
$out = "$root/evidence/stress"
$harness = "$out/classes"

function Invoke-Tool([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE." }
}

$before = Get-Content -LiteralPath "$priorDeckPath/frames/manifest.tsv"
$after = Get-Content -LiteralPath "$currentDeckPath/frames/manifest.tsv"
if (Compare-Object $before $after -SyncWindow 0) { throw 'Deck fixture manifests differ.' }
New-Item -ItemType Directory -Path $harness -Force | Out-Null
Invoke-Tool "$bin/javac.exe" @('-encoding','UTF-8','-cp',$currentClasses,'-d',$harness,
    "$root/VerifyScreen.java","$PSScriptRoot/StressKennardZip.java","$PSScriptRoot/VerifyScoreTransitions.java")
Invoke-Tool "$bin/java.exe" @('-cp',"$harness;$currentClasses",'com.qroker.offline.VerifyScoreTransitions',
    $browserEvidencePath,$isolationEvidencePath,$out) | Tee-Object -FilePath "$out/scoring.txt"
foreach ($mode in @('matrix','directions','joker')) {
    Invoke-Tool "$bin/java.exe" @('-Xmx384m','-cp',"$harness;$priorClassesPath",'com.qroker.offline.StressKennardZip',
        $priorDeckPath,$mode,"$out/before-$mode.tsv")
    Invoke-Tool "$bin/java.exe" @('-Xmx384m','-cp',"$harness;$currentClasses",'com.qroker.offline.StressKennardZip',
        $currentDeckPath,$mode,"$out/after-$mode.tsv")
}
Invoke-Tool python @("$PSScriptRoot/compare.py",$out)
