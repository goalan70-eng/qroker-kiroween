param(
    [string]$Sdk = 'D:/Android/Sdk',
    [string]$Jdk = 'D:/Android/Android Studio1/jbr',
    [string]$SigningKey = '',
    [string]$Source = '',
    [string]$ArchiveSigningKey = ''
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if ($Source) { $Source = (Resolve-Path -LiteralPath $Source).Path }
$defaultKey = !$SigningKey
if ($defaultKey) { $SigningKey = Join-Path $PSScriptRoot 'build/local-prototype.p12' }
$qrTool = Join-Path $Sdk 'build-tools/36.1.0'
$qrAndroidJar = Join-Path $Sdk 'platforms/android-36.1/android.jar'
$qrBin = Join-Path $Jdk 'bin'

function Run-Tool([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE." }
}

New-Item -ItemType Directory -Path build/generated,build/tests,build/classes,build/dex,dist -Force | Out-Null
if ($Source) {
    Run-Tool python @('generate-layout.py', $Source, 'build/generated/Layout30.java')
} else {
    Copy-Item -LiteralPath 'geometry/Layout30.java' -Destination 'build/generated/Layout30.java' -Force
}
$qrScreen = '../screen-playtest'
$qrOptics = "$qrScreen/optics"
$qrCore = @('src/OpticalReader.java','src/GameScore.java','src/ScoreJournal.java','src/ConfirmationFrame.java','build/generated/Layout30.java',
    "$qrOptics/ExtraBars.java","$qrOptics/TrialWords.java","$qrOptics/ErasureDecoder.java")
Run-Tool "$qrBin/javac.exe" (@('-encoding','UTF-8','-d','build/tests') + $qrCore +
    @('tests/OfflineTest.java',"$qrOptics/VerifyErasureDecoder.java","$qrScreen/VerifyScreen.java"))
if ($Source) {
    Run-Tool "$qrBin/java.exe" @('-cp','build/tests','com.qroker.offline.OfflineTest',"$Source/small-marker-audit")
} else {
    Write-Host 'The private camera fixtures are absent. Skipping the fixture-based OfflineTest suite.'
}
Run-Tool "$qrBin/java.exe" @('-cp','build/tests','com.qroker.offline.VerifyErasureDecoder')
$qrScreenFixtures = "$qrScreen/evidence/marker-isolation"
if (Test-Path -LiteralPath "$qrScreenFixtures/expected.tsv") {
    Run-Tool "$qrBin/java.exe" @('-cp','build/tests','com.qroker.offline.VerifyScreen',$qrScreenFixtures)
}
& "$PSScriptRoot/link-resources.ps1" -Tool "$qrTool/aapt2.exe" -AndroidJar $qrAndroidJar -Build 'build' -Manifest 'AndroidManifest.xml'
Run-Tool "$qrBin/javac.exe" (@('-encoding','UTF-8','--release','8','-cp',$qrAndroidJar,'-d','build/classes') +
    $qrCore + @('build/generated/com/qroker/offline/R.java','src/LiveCamera.java','src/MainActivity.java'))
$qrClasses = @(Get-ChildItem -LiteralPath 'build/classes' -Recurse -Filter '*.class' |
    ForEach-Object { $_.FullName })
Run-Tool "$qrBin/java.exe" (@('-cp',"$qrTool/lib/d8.jar",'com.android.tools.r8.D8',
    '--release','--min-api','26','--lib',$qrAndroidJar,'--output','build/dex') + $qrClasses)
Run-Tool python @('package-dex.py','build/unsigned.apk','build/dex/classes.dex')
Run-Tool "$qrTool/zipalign.exe" @('-f','4','build/unsigned.apk','build/aligned.apk')
if (!(Test-Path -LiteralPath $SigningKey)) {
    if (!$defaultKey -or (Test-Path -LiteralPath 'dist/QRoker-Offline.apk')) {
        throw 'Supply the signing key for the existing installation before publishing an update.'
    }
    Run-Tool "$qrBin/keytool.exe" @('-genkeypair','-storetype','PKCS12','-keystore',$SigningKey,
        '-storepass','qroker-prototype','-alias','qroker-local','-dname','CN=QRoker Local Prototype',
        '-keyalg','RSA','-keysize','2048','-validity','3650')
}
function Get-SignerDigest([string]$Apk) {
    $cert = Run-Tool "$qrBin/java.exe" @('-jar',"$qrTool/lib/apksigner.jar",'verify','--print-certs',$Apk)
    $match = [regex]::Match(($cert -join "`n"), 'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]{64})')
    if (!$match.Success) { throw "Could not identify the signer of $Apk." }
    return $match.Groups[1].Value
}

function Write-Update([string]$Name, [string]$Key, [string]$RequiredSigner) {
    $signed = "build/$Name.apk"
    $output = "dist/$Name.apk"
    Run-Tool "$qrBin/java.exe" @('-jar',"$qrTool/lib/apksigner.jar",'sign','--ks',$Key,
        '--ks-key-alias','qroker-local','--ks-pass','pass:qroker-prototype','--out',$signed,'build/aligned.apk')
    $signer = Get-SignerDigest $signed
    if (($RequiredSigner -and $signer -ne $RequiredSigner) -or
        ((Test-Path -LiteralPath $output) -and $signer -ne (Get-SignerDigest $output))) {
        throw "The signing certificate does not match the update path for $Name."
    }
    Copy-Item -LiteralPath $signed -Destination $output -Force
    Copy-Item -LiteralPath "$signed.idsig" -Destination "$output.idsig" -Force
    Run-Tool "$qrTool/aapt2.exe" @('dump','permissions',$output)
    Get-FileHash -LiteralPath $output -Algorithm SHA256
}

Write-Update 'QRoker-Offline' $SigningKey ''
if ($ArchiveSigningKey) {
    Write-Update 'QRoker-Offline-ArchiveUpdate' $ArchiveSigningKey 'c95063c3922b78dd74bdad31d7c61747599c700016e64abbbded44626897d9da'
}
