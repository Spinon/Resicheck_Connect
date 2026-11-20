# New opt-in candidate adapter. Historical builders remain untouched.
param([Parameter(Mandatory=$true)][string]$CandidateRoot,[switch]$PrepareOnly,[switch]$BuildUnsigned)
$ErrorActionPreference='Stop'
if($PrepareOnly -eq $BuildUnsigned){throw 'Choose PrepareOnly or BuildUnsigned'}
$root=[IO.Path]::GetFullPath($CandidateRoot)
& node (Join-Path $root 'apps/mobile/candidates/messaging33/prepare-android.mjs') --root $root --apply-native
if($LASTEXITCODE -ne 0){throw 'Candidate source/native preparation refused'}
if($PrepareOnly){return}
$gate=Get-Content -LiteralPath (Join-Path $root 'output/messaging33-candidate/release-gate.json') -Raw|ConvertFrom-Json
$source=Get-Content -LiteralPath (Join-Path $root 'output/messaging33-candidate/source-snapshot.json') -Raw|ConvertFrom-Json
if($gate.ready -ne $true -or $gate.imagesAvailable -ne $true -or $gate.sourceFingerprint -ne $source.fingerprint){throw 'Joint candidate/release gate not ready; no Gradle invoked'}
$plan=Get-Content -LiteralPath (Join-Path $root 'apps/mobile/candidates/messaging33/release-plan.PREPARED.json') -Raw|ConvertFrom-Json
if($plan.versionCode -ne 33){throw 'Unexpected candidate'}
$android=Join-Path $root 'apps/mobile/android'
$names=@('EXPO_NO_TELEMETRY','EXPO_OFFLINE','EXPO_NO_DOTENV','NODE_ENV');$old=@{}
foreach($n in $names){$old[$n]=[Environment]::GetEnvironmentVariable($n,'Process')}
Push-Location -LiteralPath $android
try{
 $env:EXPO_NO_TELEMETRY='1';$env:EXPO_OFFLINE='1';$env:EXPO_NO_DOTENV='1';$env:NODE_ENV='production'
 & .\gradlew.bat :app:assembleRelease --init-script messaging33-android.init.gradle ('-PreactNativeArchitectures='+($plan.android.architectures -join ',')) '-Pandroid.cmakeVersion=3.30.5' --offline --no-daemon --max-workers=2 --console=plain
 if($LASTEXITCODE -ne 0){throw 'Candidate unsigned build failed'}
 Write-Output (Join-Path $android 'messaging33-build/outputs/apk/release/app-release-unsigned.apk')
}finally{Pop-Location;foreach($n in $names){[Environment]::SetEnvironmentVariable($n,$old[$n],'Process')}}
