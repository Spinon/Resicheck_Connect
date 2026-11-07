$ErrorActionPreference = 'Stop'
$probeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$probeSdk = $env:ANDROID_HOME
if (-not $probeSdk) { $probeSdk = $env:ANDROID_SDK_ROOT }
if (-not $probeSdk -or -not $env:JAVA_HOME) { throw 'Configure ANDROID_HOME e JAVA_HOME para as ferramentas existentes.' }
$probeTools = Join-Path $probeSdk 'build-tools\36.0.0'
$probeAndroidJar = Join-Path $probeSdk 'platforms\android-36\android.jar'
$probeJavac = Join-Path $env:JAVA_HOME 'bin\javac.exe'
$probeKey = Join-Path $probeRoot 'apps\mobile\android\app\debug.keystore'
foreach ($probeRequired in @($probeJavac, $probeAndroidJar, $probeKey, (Join-Path $probeTools 'aapt.exe'), (Join-Path $probeTools 'd8.bat'), (Join-Path $probeTools 'zipalign.exe'), (Join-Path $probeTools 'apksigner.bat'))) {
  if (-not (Test-Path -LiteralPath $probeRequired)) { throw "Ferramenta/arquivo existente necessário: $probeRequired" }
}
$probeOutput = Join-Path $probeRoot ('output\selection-causal\build-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$probeClasses = Join-Path $probeOutput 'classes'
$probeDex = Join-Path $probeOutput 'dex'
New-Item -ItemType Directory -Path $probeClasses, $probeDex | Out-Null
function Invoke-ProbeTool {
  param([string]$ToolPath, [string[]]$ToolArguments)
  & $ToolPath @ToolArguments
  if ($LASTEXITCODE -ne 0) { throw "Falha na ferramenta diagnóstica: $ToolPath ($LASTEXITCODE)" }
}
Invoke-ProbeTool $probeJavac (@('-source', '8', '-target', '8', '-classpath', $probeAndroidJar, '-d', $probeClasses) + @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.java' | Select-Object -ExpandProperty FullName))
$probeClassFiles = @(Get-ChildItem -LiteralPath $probeClasses -Recurse -Filter '*.class' | Select-Object -ExpandProperty FullName)
Invoke-ProbeTool (Join-Path $probeTools 'd8.bat') (@('--min-api', '24', '--lib', $probeAndroidJar, '--output', $probeDex) + $probeClassFiles)
$probeUnsigned = Join-Path $probeOutput 'probe-unsigned.apk'
Invoke-ProbeTool (Join-Path $probeTools 'aapt.exe') @('package', '-f', '-M', (Join-Path $PSScriptRoot 'AndroidManifest.xml'), '-I', $probeAndroidJar, '-F', $probeUnsigned)
Push-Location -LiteralPath $probeDex
try { Invoke-ProbeTool (Join-Path $probeTools 'aapt.exe') @('add', $probeUnsigned, 'classes.dex') }
finally { Pop-Location }
$probeAligned = Join-Path $probeOutput 'probe-aligned.apk'
$probeApk = Join-Path $probeOutput 'selection-probe.apk'
Invoke-ProbeTool (Join-Path $probeTools 'zipalign.exe') @('-f', '-p', '4', $probeUnsigned, $probeAligned)
# The existing generated Android Debug key uses the public Android debug password.
# No account, production signing key or new credential is created.
Invoke-ProbeTool (Join-Path $probeTools 'apksigner.bat') @('sign', '--ks', $probeKey, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $probeApk, $probeAligned)
Invoke-ProbeTool (Join-Path $probeTools 'apksigner.bat') @('verify', '--verbose', '--print-certs', $probeApk)
$probeReceipt = [ordered]@{ apk = $probeApk; sha256 = (Get-FileHash -LiteralPath $probeApk -Algorithm SHA256).Hash.ToLowerInvariant(); sourceSha256 = (Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'ProbeActivity.java') -Algorithm SHA256).Hash.ToLowerInvariant(); package = 'com.resicheck.connect.selectionprobe'; versionCode = 1; sdk = 'existing android36/build-tools36.0.0'; installed = $false }
$probeReceipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $probeOutput 'build-summary.json') -Encoding utf8
$probeReceipt | ConvertTo-Json
