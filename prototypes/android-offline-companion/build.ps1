param(
    [string]$Sdk = 'D:/Android/Sdk',
    [string]$Jdk = 'D:/Android/Android Studio1/jbr',
    [string]$SigningKey = '',
    [string]$Source = ''
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (!$Source) { throw 'Specify -Source with the local 30 mm layout, codebook and small-marker-audit fixtures.' }
$Source = (Resolve-Path -LiteralPath $Source).Path
if (!$SigningKey) { $SigningKey = Join-Path $PSScriptRoot 'build/local-prototype.p12' }
$qrTool = Join-Path $Sdk 'build-tools/36.1.0'
$qrAndroidJar = Join-Path $Sdk 'platforms/android-36.1/android.jar'
$qrBin = Join-Path $Jdk 'bin'

function Run-Tool([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE." }
}

New-Item -ItemType Directory -Path build/generated,build/tests,build/classes,build/dex,dist -Force | Out-Null
Run-Tool python @('generate-layout.py', $Source, 'build/generated/Layout30.java')
$qrCore = @('src/OpticalReader.java','src/GameScore.java','src/ConfirmationFrame.java','build/generated/Layout30.java')
Run-Tool "$qrBin/javac.exe" (@('-encoding','UTF-8','-d','build/tests') + $qrCore + 'tests/OfflineTest.java')
Run-Tool "$qrBin/java.exe" @('-cp','build/tests','com.qroker.offline.OfflineTest',"$Source/small-marker-audit")
Run-Tool "$qrBin/javac.exe" (@('-encoding','UTF-8','--release','8','-cp',$qrAndroidJar,'-d','build/classes') +
    $qrCore + @('src/LiveCamera.java','src/MainActivity.java'))
$qrClasses = @(Get-ChildItem -LiteralPath 'build/classes' -Recurse -Filter '*.class' |
    ForEach-Object { $_.FullName })
Run-Tool "$qrBin/java.exe" (@('-cp',"$qrTool/lib/d8.jar",'com.android.tools.r8.D8',
    '--release','--min-api','26','--lib',$qrAndroidJar,'--output','build/dex') + $qrClasses)
Run-Tool "$qrTool/aapt2.exe" @('link','-I',$qrAndroidJar,'--manifest','AndroidManifest.xml',
    '-o','build/unsigned.apk')
Run-Tool python @('package-dex.py','build/unsigned.apk','build/dex/classes.dex')
Run-Tool "$qrTool/zipalign.exe" @('-f','4','build/unsigned.apk','build/aligned.apk')
if (!(Test-Path -LiteralPath $SigningKey)) {
    Run-Tool "$qrBin/keytool.exe" @('-genkeypair','-storetype','PKCS12','-keystore',$SigningKey,
        '-storepass','qroker-prototype','-alias','qroker-local','-dname','CN=QRoker Local Prototype',
        '-keyalg','RSA','-keysize','2048','-validity','3650')
}
Run-Tool "$qrBin/java.exe" @('-jar',"$qrTool/lib/apksigner.jar",'sign','--ks',$SigningKey,
    '--ks-key-alias','qroker-local','--ks-pass','pass:qroker-prototype',
    '--out','dist/QRoker-Offline.apk','build/aligned.apk')
Run-Tool "$qrBin/java.exe" @('-jar',"$qrTool/lib/apksigner.jar",'verify','--verbose',
    'dist/QRoker-Offline.apk')
Run-Tool "$qrTool/aapt2.exe" @('dump','permissions','dist/QRoker-Offline.apk')
Get-FileHash -LiteralPath 'dist/QRoker-Offline.apk' -Algorithm SHA256
