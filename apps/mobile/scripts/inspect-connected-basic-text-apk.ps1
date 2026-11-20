param([Parameter(Mandatory=$true)][string]$Apk,[ValidateSet('qa','phone')][string]$Profile='qa')
$ErrorActionPreference='Stop'
$workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$candidate=[IO.Path]::GetFullPath($Apk)
$allowed=[IO.Path]::GetFullPath((Join-Path $workspace ('output\connected-basic-text-android-'+$Profile)))+[IO.Path]::DirectorySeparatorChar
if(-not $candidate.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or -not(Test-Path -LiteralPath $candidate -PathType Leaf) -or [IO.Path]::GetExtension($candidate) -ne '.apk'){throw 'Explicit connected basic text output APK required'}
$folder=[IO.Path]::GetDirectoryName($candidate)
Push-Location -LiteralPath $workspace
try{
 $currentPreparationJson=& node --experimental-strip-types apps/mobile/scripts/prepare-connected-basic-text.mjs --profile $Profile --check
 if($LASTEXITCODE -ne 0){throw 'Public configuration receipt validation failed'}
 $currentPreparation=($currentPreparationJson -join "`n") | ConvertFrom-Json
}finally{Pop-Location}
$archivedPreparation=Get-Content -LiteralPath (Join-Path $folder 'preparation.json') -Raw | ConvertFrom-Json
foreach($field in @('projectRef','profile','package','label','versionName','versionCode','architectures','keySha256','sourceConfigSha256','sourceReceiptSha256','entrySha256','manifestSha256','expoConfigSha256','expoSdkVersion','expoConstantsVersion')){
 if($archivedPreparation.$field -ne $currentPreparation.$field){throw 'APK preparation inputs differ from reviewed current sources'}
}
$currentSourceNames=@($currentPreparation.sourceHashes.PSObject.Properties.Name | Sort-Object)
$archivedSourceNames=@($archivedPreparation.sourceHashes.PSObject.Properties.Name | Sort-Object)
if(($currentSourceNames -join ',') -ne ($archivedSourceNames -join ',')){throw 'APK preparation source set changed'}
foreach($name in $currentSourceNames){if($archivedPreparation.sourceHashes.$name -ne $currentPreparation.sourceHashes.$name){throw 'APK preparation source hash changed'}}
$config=Get-Content -LiteralPath (Join-Path $workspace 'output\managed-registration-online\public-config.json') -Raw | ConvertFrom-Json
$spec=Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\candidates\connected-basic-text\build-spec.json') -Raw | ConvertFrom-Json
$selected=$spec.$Profile
$aapt=Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\aapt.exe'
$permissions=& $aapt dump permissions $candidate
if($LASTEXITCODE -ne 0){throw 'Permission inspection failed'}
$allowedPermissions=@('android.permission.INTERNET',($selected.package+'.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'))
$usedPermissions=@()
foreach($line in $permissions){if($line -match "^uses-permission: name='([^']+)'" ){$permission=$Matches[1];$usedPermissions+=$permission;if($allowedPermissions -notcontains $permission){throw 'Unreviewed Android permission'}}}
if($usedPermissions -notcontains 'android.permission.INTERNET'){throw 'INTERNET permission missing'}
$badging=& $aapt dump badging $candidate
if($LASTEXITCODE -ne 0){throw 'Package inspection failed'}
$badgingText=$badging -join "`n"
if($badgingText -notmatch ("package: name='"+[regex]::Escape($selected.package)+"'") -or $badgingText -notmatch ("versionCode='"+$selected.versionCode+"'") -or $badgingText -notmatch ("versionName='"+[regex]::Escape($selected.versionName)+"'")){throw 'Unexpected candidate package/version'}
if($badgingText -match 'application-debuggable'){throw 'Connected release must not be debuggable'}
if($badgingText -notmatch ("(?m)^application-label:'"+[regex]::Escape($selected.label)+"'$")){throw 'Existing application label was not preserved'}
if($badgingText -notmatch "launchable-activity: name='com.resicheck.connect.demo.PrivacyActivity'"){throw 'Protected PrivacyActivity launcher missing'}
$nativeLine=@($badging|Where-Object {$_ -match '^native-code:'}) -join ''
$actualAbis=@([regex]::Matches($nativeLine,"'([^']+)'")|ForEach-Object {$_.Groups[1].Value})|Sort-Object
$expectedAbis=@($selected.architectures.Split(','))|Sort-Object
if(($actualAbis -join ',') -ne ($expectedAbis -join ',')){throw 'Unexpected candidate ABIs'}
$manifest=& $aapt dump xmltree $candidate AndroidManifest.xml
if($LASTEXITCODE -ne 0){throw 'Manifest inspection failed'}
$manifestText=$manifest -join "`n"
foreach($attribute in @('allowBackup','usesCleartextTraffic')){if($manifestText -notmatch ("android:"+$attribute+'[^\r\n]*\(type 0x12\)0x0')){throw 'Unsafe manifest backup/cleartext flag'}}
if($manifestText -match 'android:debuggable[^\r\n]*\(type 0x12\)0xffffffff'){throw 'Manifest enables debugging'}
if($manifestText -notmatch 'android:name[^\r\n]*com\.resicheck\.connect\.demo\.PrivacyApplication'){throw 'Protected PrivacyApplication missing'}
if($manifestText -notmatch 'android:networkSecurityConfig[^\r\n]*=@(0x[0-9a-f]+)'){throw 'Network resource reference missing'}
$networkId=$Matches[1]
$resources=& $aapt dump --values resources $candidate
if($LASTEXITCODE -ne 0){throw 'Resource inspection failed'}
$resourceText=$resources -join "`n"
$pattern='(?m)^\s*resource '+[regex]::Escape($networkId)+' '+[regex]::Escape($selected.package)+':xml/connect_basic_text_network:[^\r\n]*\r?\n\s*\(string(?:8|16)\) "([^"\r\n]+)"'
if($resourceText -notmatch $pattern){throw 'Reviewed network XML resource missing'}
$networkPath=$Matches[1]
if($networkPath -notmatch '^res/[A-Za-z0-9_./-]+\.xml$'){throw 'Unexpected compiled XML path'}
$network=& $aapt dump xmltree $candidate $networkPath
if($LASTEXITCODE -ne 0){throw 'Network XML inspection failed'}
$networkText=$network -join "`n"
if(@($network|Select-String '^\s*E:').Count -ne 4 -or @($network|Select-String '^\s*A:').Count -ne 2 -or $networkText -notmatch 'cleartextTrafficPermitted=\(type 0x12\)0x0' -or $networkText -notmatch 'src="system"' -or $networkText -match 'debug-overrides|domain-config'){throw 'Unreviewed trust/cleartext configuration'}
$signature=& (Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\apksigner.bat') verify --verbose --print-certs $candidate
if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}
$signatureText=$signature -join "`n"
if($signatureText -notmatch '(?im)^Signer #1 certificate SHA-256 digest:\s*([0-9a-f]{64})\s*$'){throw 'APK signing certificate digest missing'}
$apkCertificateSha256=$Matches[1].ToLowerInvariant()
$existingKeystore=Join-Path $workspace 'apps\mobile\android\app\debug.keystore'
$existingCertificate=& (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -list -v -keystore $existingKeystore -storepass android -alias androiddebugkey
if($LASTEXITCODE -ne 0){throw 'Existing signing certificate inspection failed'}
if(($existingCertificate -join "`n") -notmatch '(?im)^\s*SHA256:\s*((?:[0-9a-f]{2}:){31}[0-9a-f]{2})\s*$'){throw 'Existing signing certificate digest missing'}
$expectedCertificateSha256=$Matches[1].Replace(':','').ToLowerInvariant()
if($apkCertificateSha256 -ne $expectedCertificateSha256){throw 'Candidate does not use the existing update signing certificate'}
$archive=[IO.Compression.ZipFile]::OpenRead($candidate)
try{
 $expoEntries=@($archive.Entries | Where-Object {$_.FullName -eq 'assets/app.config'});if($expoEntries.Count -ne 1){throw 'Exactly one embedded Expo config required'}
 $expoEntry=$expoEntries[0];if($expoEntry.Length -lt 2 -or $expoEntry.Length -gt 16384){throw 'Embedded Expo config outside reviewed size bound'}
 $expoStream=$expoEntry.Open();$expoMemory=[IO.MemoryStream]::new()
 try{$expoStream.CopyTo($expoMemory);$expoBytes=$expoMemory.ToArray()}finally{$expoStream.Dispose();$expoMemory.Dispose()}
 $expoSha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($expoBytes)).ToLowerInvariant()
 if($expoSha -ne $archivedPreparation.expoConfigSha256){throw 'Embedded Expo asset differs from reviewed per-profile configuration'}
 $expoConfig=[Text.Encoding]::UTF8.GetString($expoBytes)|ConvertFrom-Json
 if($expoConfig.version -ne $selected.versionName -or $expoConfig.android.package -ne $selected.package -or $expoConfig.android.versionCode -ne $selected.versionCode -or $expoConfig.name -ne $selected.label -or $expoConfig.extra.buildProfile -ne $Profile -or $expoConfig.extra.realBackend -ne $true -or $expoConfig.updates.enabled -ne $false){throw 'Embedded Expo metadata contradicts native build identity or update policy'}
 $expoResult=[ordered]@{status='passed-embedded-expo-native-consistency';sha256=$expoSha;bytes=$expoBytes.Length;profile=$Profile;package=$expoConfig.android.package;versionName=$expoConfig.version;versionCode=$expoConfig.android.versionCode;realBackend=$true;updatesEnabled=$false;containsCredentials=$false}
 $expoResult|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'expo-config-check.json') -Encoding utf8
 $entry=$archive.GetEntry('assets/index.android.bundle');if(-not $entry){throw 'JS bundle missing'}
 $stream=$entry.Open();$memory=[IO.MemoryStream]::new()
 try{$stream.CopyTo($memory);$bytes=$memory.ToArray()}finally{$stream.Dispose();$memory.Dispose()}
 $strings=[Text.Encoding]::Latin1.GetString($bytes)
 if(-not $strings.Contains($config.publishableKey) -or -not $strings.Contains($config.projectUrl)){throw 'Reviewed public configuration not found in bundle'}
 foreach($fixture in @('APP204_QA','expireFirstSignInAfterMs','qa-read-retry','syntheticpass','synthetic-password','synthetic.access.value','synthetic-refresh','opaque-synthetic','local_build_admission_only','@example.invalid','/auth/v1/admin/')){if($strings.Contains($fixture)){throw 'Test/admin fixture found in connected bundle'}}
 foreach($route in @('send_text','basic-manual','my_connect_memberships','my_connect_staff_employer','connect_staff_inbox','search_connect_companies','managed_connect_staff','link_patient','request_staff','approve_staff','revoke_staff')){if(-not $strings.Contains($route)){throw 'Expected membership management surface missing from bundle'}}
 if($strings -match 'sb_secret_[A-Za-z0-9_-]{8,}'){throw 'Privileged key pattern found in bundle'}
 foreach($match in [regex]::Matches($strings,'eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+')){
  try{$payload=$match.Groups[1].Value.Replace('-','+').Replace('_','/');$payload=$payload.PadRight([int]([Math]::Ceiling($payload.Length/4)*4),'=');$decoded=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))|ConvertFrom-Json}catch{continue}
  if($decoded.role -eq 'service_role'){throw 'Privileged JWT found in bundle'}
 }
 foreach($file in $archive.Entries){if($file.FullName -match '(?:^|/)\.env(?:\.|$)|\.keystore$|\.jks$|credentials\.json$'){throw 'Credential artifact found in APK'}}
 $bundleResult=[ordered]@{status='passed-static-bundle-check';reviewedPublicConfigurationPresent=$true;knownTestAdminFixturesAbsent=$true;privilegedKeyPatternAbsent=$true;privilegedJwtRoleAbsent=$true;credentialArtifactsAbsent=$true;membershipReadSurfacePresent=$true;preparationSourceHashesMatch=$true;bundleBytes=$bytes.Length;bundleSha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant();realAuthExecuted=$false;serverReadOnly=$false}
 $bundleResult|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'bundle-check.json') -Encoding utf8
}finally{$archive.Dispose()}
$manifest|Set-Content -LiteralPath (Join-Path $folder 'manifest.txt') -Encoding utf8
$permissions|Set-Content -LiteralPath (Join-Path $folder 'permissions.txt') -Encoding utf8
$network|Set-Content -LiteralPath (Join-Path $folder 'network-security.txt') -Encoding utf8
$signature|Set-Content -LiteralPath (Join-Path $folder 'signature.txt') -Encoding utf8
$badging|Set-Content -LiteralPath (Join-Path $folder 'badging.txt') -Encoding utf8
$result=[ordered]@{scope='Uninstalled protected basic-text candidate, not a delivery';apk=$candidate;profile=$Profile;package=$selected.package;versionName=$selected.versionName;versionCode=$selected.versionCode;sha256=(Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant();sizeBytes=(Get-Item -LiteralPath $candidate).Length;architectures=$selected.architectures;internetPermission=$true;microphoneDeclared=$false;storagePermissions=$false;allowBackup=$false;debuggable=$false;usesCleartextTraffic=$false;usesExistingDebugSignature=$true;sameExistingSigningCertificate=$true;signingCertificateSha256=$apkCertificateSha256;protectedActivity='com.resicheck.connect.demo.PrivacyActivity';preparationSourceHashesMatch=$true;realAuthExecuted=$false;installed=$false;published=$false;serverReadOnly=$false;embeddedExpoMetadataMatchesNative=$true;expoConfigSha256=$expoSha;basicTextEnabled=$true;controlledLocalExpiry=$false;injectedNetworkFailure=$false}
$result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $folder 'build.json') -Encoding utf8
$result|ConvertTo-Json
