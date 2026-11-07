#Requires -Version 7.2
# Disposable SQL/RLS fallback using already-installed PostgreSQL, not Supabase Auth.
# No existing database, Windows service, Docker resource or credential is modified.
param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin')
$ErrorActionPreference = 'Stop'
$connectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$connectOutput = Join-Path $connectRoot 'output\postgres-rls'
$connectRun = Join-Path $connectOutput ([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff'))
$connectData = Join-Path $connectRun 'data'
$connectPort = 56332
$connectPasswordFile = Join-Path $connectRun 'password.tmp'
$connectOldPassword = $env:PGPASSWORD
$connectStarted = $false
$connectFiles = @('supabase\tests\postgres-auth-fixture.sql','supabase\deployment\preflight-readonly.sql','supabase\migrations\20261106200713_connect_foundation.sql','supabase\tests\catalog_checks.sql','supabase\tests\rls_cases.sql','supabase\tests\concurrency_fixture.sql')
foreach ($connectRelative in $connectFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $connectRoot $connectRelative))) { throw "Missing SQL input: $connectRelative" }
}
foreach ($connectExe in @('initdb.exe','pg_ctl.exe','psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $connectExe))) { throw 'PostgreSQL binaries absent; this script never installs software.' }
}
if (Get-NetTCPConnection -LocalPort $connectPort -State Listen -ErrorAction SilentlyContinue) { throw 'Disposable test port occupied; refusing to touch the listener.' }
New-Item -ItemType Directory -Path $connectRun -Force | Out-Null
$connectPassword = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
[IO.File]::WriteAllText($connectPasswordFile,$connectPassword,[Text.UTF8Encoding]::new($false))
try {
  & (Join-Path $PostgresBin 'initdb.exe') -D $connectData -U connect_test_owner --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=$connectPasswordFile --encoding=UTF8 --locale=C > (Join-Path $connectRun 'initdb.log') 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Disposable initdb failed; inspect ignored local initdb.log.' }
  # The path is passed as an argument; only fixed port/listen options go to postgres.
  $connectStarted = $true
  $connectStartArgs = @('start','-D',('"'+$connectData+'"'),'-l',('"'+(Join-Path $connectRun 'postgres.log')+'"'),'-o',('"-p '+$connectPort+' -h 127.0.0.1"'),'-w','-t','30')
  # Do not use Start-Process -Wait: on Windows it can also wait for the server's
  # descendants. Wait only for the pg_ctl launcher, with bounded time and hidden UI.
  $connectLauncher = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList $connectStartArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $connectRun 'start.log') -RedirectStandardError (Join-Path $connectRun 'start-error.log')
  if (-not $connectLauncher.WaitForExit(35000) -or $connectLauncher.ExitCode -ne 0) { throw 'Disposable PostgreSQL failed to start.' }
  $env:PGPASSWORD = $connectPassword
  foreach ($connectRelative in $connectFiles) {
    $connectInput = Join-Path $connectRoot $connectRelative
    if (-not (Test-Path -LiteralPath $connectInput)) { throw "Missing SQL input: $connectRelative" }
    $connectLog = Join-Path $connectRun (([IO.Path]::GetFileName($connectInput)) + '.log')
    & (Join-Path $PostgresBin 'psql.exe') -X -h 127.0.0.1 -p $connectPort -U connect_test_owner -d postgres -v ON_ERROR_STOP=1 -f $connectInput > $connectLog 2>&1
    if ($LASTEXITCODE -ne 0) { throw "SQL phase failed: $connectRelative; inspect $connectLog" }
  }
  & node (Join-Path $connectRoot 'scripts\test-database-concurrency.mjs') $PostgresBin (Join-Path $connectRun 'concurrency-result.json') > (Join-Path $connectRun 'concurrency.log') 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Real PostgreSQL concurrency tests failed; inspect ignored concurrency.log.' }
  [ordered]@{status='passed';engine='PostgreSQL 17 installed locally';scope='real SQL/RLS with fixture Auth functions; not full Supabase Auth';port=$connectPort;loopbackOnly=$true;productionSecurityValidated=$false;files=$connectFiles} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $connectRun 'result.json') -Encoding utf8
  Write-Output "SQL/RLS tests passed. Evidence: $connectRun"
} finally {
  if ($connectStarted) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') stop -D $connectData -m fast -w -t 30 > (Join-Path $connectRun 'stop.log') 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Test cluster did not confirm stop; inspect only this run data directory.' }
  }
  $env:PGPASSWORD = $connectOldPassword
  if (Test-Path -LiteralPath $connectPasswordFile) { Remove-Item -LiteralPath $connectPasswordFile }
  $connectPassword = $null
}
