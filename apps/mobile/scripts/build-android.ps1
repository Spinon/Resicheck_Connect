param(
  [ValidateSet('arm64-v8a,x86_64', 'arm64-v8a', 'x86_64')]
  [string]$Architectures = 'arm64-v8a,x86_64'
)

$ErrorActionPreference = 'Stop'
$connectAndroid = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\android'))
if (-not (Test-Path -LiteralPath (Join-Path $connectAndroid 'gradlew.bat'))) {
  throw 'Primeiro execute npm run prebuild:android na pasta mobile.'
}
$connectSdk = $env:ANDROID_HOME
if (-not $connectSdk) { $connectSdk = $env:ANDROID_SDK_ROOT }
if (-not $connectSdk) { throw 'Configure o SDK Android autorizado antes de compilar.' }
foreach ($component in @('platforms\android-36', 'ndk\27.1.12297006', 'cmake\3.30.5')) {
  if (-not (Test-Path -LiteralPath (Join-Path $connectSdk $component))) {
    throw "Componente ausente: $component. Prepare a instalação autorizada primeiro."
  }
}

$previousNodeEnv = $env:NODE_ENV
$previousTelemetry = $env:EXPO_NO_TELEMETRY
$previousOffline = $env:EXPO_OFFLINE
$previousCi = $env:CI
# Retain third-party notices in the generated APK; no runtime permissions needed.
$connectWorkspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$connectNotices = Join-Path $connectAndroid 'app\src\main\assets\third-party'
New-Item -ItemType Directory -Path $connectNotices -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $connectWorkspace 'packages\text\UNICODE-SEGMENTER-LICENSE.txt') -Destination (Join-Path $connectNotices 'unicode-segmenter-MIT.txt')
Copy-Item -LiteralPath (Join-Path $connectWorkspace 'packages\text\tests\fixtures\UNICODE-LICENSE.txt') -Destination (Join-Path $connectNotices 'unicode-data-V3.txt')
Push-Location -LiteralPath $connectAndroid
try {
  $env:NODE_ENV = 'production'
  $env:EXPO_NO_TELEMETRY = '1'
  $env:EXPO_OFFLINE = '1'
  $env:CI = '1'
  & .\gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" '-Pandroid.cmakeVersion=3.30.5' --no-daemon --console=plain
  if ($LASTEXITCODE -ne 0) { throw "Compilação Android falhou: $LASTEXITCODE" }
} finally {
  Pop-Location
  $env:NODE_ENV = $previousNodeEnv
  $env:EXPO_NO_TELEMETRY = $previousTelemetry
  $env:EXPO_OFFLINE = $previousOffline
  $env:CI = $previousCi
}
