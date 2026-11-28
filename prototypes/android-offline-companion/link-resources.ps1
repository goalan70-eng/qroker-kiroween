param([string]$Tool, [string]$AndroidJar, [string]$Build, [string]$Manifest)

& $Tool compile --dir "$PSScriptRoot/res" -o "$Build/strings.zip"
if ($LASTEXITCODE) { throw 'Could not compile the Android resources.' }
& $Tool compile --dir "$PSScriptRoot/../../assets/help" -o "$Build/help-art.zip"
if ($LASTEXITCODE) { throw 'Could not compile the shared help illustrations.' }
& $Tool link -I $AndroidJar --manifest $Manifest --java "$Build/generated" --custom-package com.qroker.offline -o "$Build/unsigned.apk" "$Build/strings.zip" "$Build/help-art.zip"
if ($LASTEXITCODE) { throw 'Could not link the Android resources.' }
