param(
    [Parameter(Mandatory)][string]$Source,
    [string]$Sdk = 'D:/Android/Sdk',
    [string]$Jdk = 'D:/Android/Android Studio1/jbr',
    [string]$SigningKey = ''
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$android = (Resolve-Path "$root/../android-offline-companion").Path
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$build = "$root/android-build"
$generated = "$build/generated"
$classes = "$build/classes"
$dex = "$build/dex"
$out = "$root/deliverables"
$optics = "$root/optics"
$tool = "$Sdk/build-tools/36.1.0"
$androidJar = "$Sdk/platforms/android-36.1/android.jar"
$bin = "$Jdk/bin"

function Invoke-Tool([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE." }
}

New-Item -ItemType Directory -Path $generated,$classes,$dex,$out,"$build/jvm" -Force | Out-Null
Invoke-Tool python @("$android/generate-layout.py",$sourcePath,"$generated/Layout30.java",'--current-only')
$core = @("$generated/Layout30.java","$android/src/OpticalReader.java","$optics/ExtraBars.java",
    "$optics/TrialWords.java","$optics/ErasureDecoder.java","$android/src/GameScore.java","$android/src/ScoreJournal.java","$android/src/ConfirmationFrame.java")
Invoke-Tool "$bin/javac.exe" (@('-encoding','UTF-8','-d',"$build/jvm") +
    $core + @("$optics/VerifyErasureDecoder.java","$root/VerifyScreen.java"))
Invoke-Tool "$bin/java.exe" @('-cp',"$build/jvm",'com.qroker.offline.VerifyErasureDecoder')
$manifest = (Get-Content -Raw -LiteralPath "$android/AndroidManifest.xml").Replace(
    'package="com.qroker.offline"', 'package="com.qroker.screencheck"').Replace(
    'android:name=".MainActivity"', 'android:name="com.qroker.offline.MainActivity"').Replace(
    'QRoker Scorekeeper', 'QRoker ScreenCheck')
$manifest | Set-Content -Encoding utf8 -LiteralPath "$generated/AndroidManifest.xml"
& "$android/link-resources.ps1" -Tool "$tool/aapt2.exe" -AndroidJar $androidJar -Build $build -Manifest "$generated/AndroidManifest.xml"
Invoke-Tool "$bin/javac.exe" (@('-encoding','UTF-8','--release','8','-cp',$androidJar,'-d',$classes) +
    $core + @("$generated/com/qroker/offline/R.java","$android/src/LiveCamera.java","$android/src/MainActivity.java"))
$classFiles = @(Get-ChildItem -LiteralPath $classes -Recurse -Filter '*.class' | ForEach-Object { $_.FullName })
Invoke-Tool "$bin/java.exe" (@('-cp',"$tool/lib/d8.jar",'com.android.tools.r8.D8','--release',
    '--min-api','26','--lib',$androidJar,'--output',$dex) + $classFiles)
Invoke-Tool python @("$android/package-dex.py","$build/unsigned.apk","$dex/classes.dex")
Invoke-Tool "$tool/zipalign.exe" @('-f','4',"$build/unsigned.apk","$build/aligned.apk")
if (!$SigningKey) { $SigningKey = "$build/local-prototype.p12" }
if (!(Test-Path -LiteralPath $SigningKey)) {
    Invoke-Tool "$bin/keytool.exe" @('-genkeypair','-storetype','PKCS12','-keystore',$SigningKey,
        '-storepass','qroker-prototype','-alias','qroker-local','-dname','CN=QRoker Local Prototype',
        '-keyalg','RSA','-keysize','2048','-validity','3650')
}
Invoke-Tool "$bin/java.exe" @('-jar',"$tool/lib/apksigner.jar",'sign','--ks',$SigningKey,
    '--ks-key-alias','qroker-local','--ks-pass','pass:qroker-prototype',
    '--out',"$out/QRoker-ScreenCheck.apk","$build/aligned.apk")
Invoke-Tool "$bin/java.exe" @('-jar',"$tool/lib/apksigner.jar",'verify','--verbose',"$out/QRoker-ScreenCheck.apk")
Invoke-Tool "$tool/aapt2.exe" @('dump','permissions',"$out/QRoker-ScreenCheck.apk")
