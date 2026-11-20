# Opt-in build/preparation only. Never installs, logs in, creates keys or publishes.
param([switch]$Phone,[switch]$PrepareOnly,[string]$InspectApk)
$ErrorActionPreference='Stop'
if($PrepareOnly -and $InspectApk){throw 'Choose preparation or APK inspection'}
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$android=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\android'))
$profile=$(if($Phone){'phone'}else{'qa'})
$spec=Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\candidates\connected-basic-text\build-spec.json') -Raw | ConvertFrom-Json
$selected=$spec.$profile
if(-not $env:JAVA_HOME -or -not $env:ANDROID_HOME){throw 'Use existing authorized JAVA_HOME and ANDROID_HOME; nothing is downloaded.'}
foreach($part in @('platforms\android-36','ndk\27.1.12297006','cmake\3.30.5','build-tools\36.0.0\aapt.exe','build-tools\36.0.0\apksigner.bat')){
 if(-not(Test-Path -LiteralPath (Join-Path $env:ANDROID_HOME $part))){throw "Existing SDK component missing: $part"}
}
foreach($executable in @('java.exe','keytool.exe')){if(-not(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME ('bin\'+$executable)))){throw 'Existing JDK executable missing'}}
if(-not(Test-Path -LiteralPath (Join-Path $android 'app\debug.keystore'))){throw 'Existing QA signature missing; no key is generated'}
foreach($file in @('ConnectPrivacyCurtain.kt','ConnectPrivacyPackage.kt','PrivacyActivity.kt','PrivacyApplication.kt')){
 if(-not(Test-Path -LiteralPath (Join-Path $PSScriptRoot ('..\native\privacy\'+$file)))){throw 'Required native privacy source missing'}
}
Push-Location -LiteralPath $workspace
try{
 if($InspectApk){
  & node --experimental-strip-types apps/mobile/scripts/prepare-connected-basic-text.mjs --profile $profile --check
 }else{
  & node --experimental-strip-types apps/mobile/scripts/prepare-connected-basic-text.mjs --profile $profile
 }
 if($LASTEXITCODE -ne 0){throw 'Public configuration/receipt review failed; do not build'}
}finally{Pop-Location}
if($PrepareOnly){Write-Output ('Prepared only: '+(Join-Path $android ('connected-basic-text-generated\'+$profile)));return}
if($InspectApk){
 & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'inspect-connected-basic-text-apk.ps1') -Apk $InspectApk -Profile $profile
 if($LASTEXITCODE -ne 0){throw 'Connected basic text APK inspection failed'}
 return
}
$names=@('NODE_ENV','EXPO_NO_TELEMETRY','EXPO_OFFLINE','EXPO_NO_DOTENV','CI');$old=@{}
foreach($name in $names){$old[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
Push-Location -LiteralPath $android
try{
 $env:NODE_ENV='production';$env:EXPO_NO_TELEMETRY='1';$env:EXPO_OFFLINE='1';$env:EXPO_NO_DOTENV='1';$env:CI='1'
 $gradleArgs=@(':app:assembleRelease','--init-script','..\scripts\connected-basic-text-android.init.gradle',('-PconnectBasicTextProfile='+$profile),('-PreactNativeArchitectures='+$selected.architectures),'-Pandroid.cmakeVersion=3.30.5','--offline','--no-daemon','--console=plain')
 & .\gradlew.bat @gradleArgs
 if($LASTEXITCODE -ne 0){throw "Connected basic text candidate build failed: $LASTEXITCODE"}
 $out=Join-Path $workspace ('output\connected-basic-text-android-'+$profile+'\'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
 New-Item -ItemType Directory -Path $out | Out-Null
 $apk=Join-Path $out ('connect-'+$selected.versionName+'-build'+$selected.versionCode+'-'+$selected.architectures.Replace(',','-')+'.apk')
 Copy-Item -LiteralPath (Join-Path $android ('connected-basic-text-build\'+$profile+'\outputs\apk\release\app-release.apk')) -Destination $apk
 Copy-Item -LiteralPath (Join-Path $android ('connected-basic-text-generated\'+$profile+'\preparation.json')) -Destination (Join-Path $out 'preparation.json')
 Copy-Item -LiteralPath (Join-Path $android ('connected-basic-text-generated\'+$profile+'\expo-public-config.json')) -Destination (Join-Path $out 'expo-public-config.json')
 & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'inspect-connected-basic-text-apk.ps1') -Apk $apk -Profile $profile
 if($LASTEXITCODE -ne 0){throw 'Connected basic text APK inspection failed; artifact is not ready'}
 # Freeze exactly the admitted build inputs after static APK/source inspection.
 $preparation=Get-Content -LiteralPath (Join-Path $out 'preparation.json') -Raw | ConvertFrom-Json
 $frozen=Join-Path $out 'frozen'
 New-Item -ItemType Directory -Path $frozen | Out-Null
 $workspacePrefix=[IO.Path]::GetFullPath($workspace)+[IO.Path]::DirectorySeparatorChar
 $frozenPrefix=[IO.Path]::GetFullPath($frozen)+[IO.Path]::DirectorySeparatorChar
 foreach($item in $preparation.sourceHashes.PSObject.Properties){
  $sourcePath=[IO.Path]::GetFullPath((Join-Path $workspace $item.Name))
  $targetPath=[IO.Path]::GetFullPath((Join-Path $frozen $item.Name))
  if(-not $sourcePath.StartsWith($workspacePrefix,[StringComparison]::OrdinalIgnoreCase) -or -not $targetPath.StartsWith($frozenPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Frozen source path outside intended directory'}
  if((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value){throw 'Build input changed before freezing'}
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($targetPath)) -Force | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath
  if((Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value){throw 'Frozen source digest mismatch'}
 }
 $sourceIndex=[ordered]@{schemaVersion=1;status='frozen-inputs-verified';count=@($preparation.sourceHashes.PSObject.Properties).Count;sources=$preparation.sourceHashes}
 $sourceIndex | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $frozen 'source-index.json') -Encoding utf8
 Write-Output $apk
}finally{
 Pop-Location
 foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$old[$name],'Process')}
}
