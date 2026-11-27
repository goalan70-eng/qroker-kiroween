param([string]$Tool, [string]$AndroidJar, [string]$Build, [string]$Manifest)

& $Tool compile --dir "$PSScriptRoot/res" -o "$Build/strings.zip"
if ($LASTEXITCODE) { throw 'Could not compile the Android string resources.' }
& $Tool link -I $AndroidJar --manifest $Manifest --java "$Build/generated" --custom-package com.qroker.offline -o "$Build/unsigned.apk" "$Build/strings.zip"
if ($LASTEXITCODE) { throw 'Could not link the Android string resources.' }
