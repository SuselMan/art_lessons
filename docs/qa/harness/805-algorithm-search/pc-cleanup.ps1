param([Parameter(Mandatory=$true)][string]$Ledger,[switch]$Watchdog,[int]$TtlSeconds=900)
$ErrorActionPreference='Stop'
$record=Get-Content -Raw $Ledger|ConvertFrom-Json
$root=[IO.Path]::GetFullPath($record.root).TrimEnd('\');$qaProfilePath=Join-Path $root 'profile'
if($record.owner -ne '805-flow' -or $root -notmatch '^C:\\Windows\\Temp\\grafetto805-flow-20261018-[a-zA-Z0-9-]+$' -or $record.profile -ne $qaProfilePath -or [IO.Path]::GetFullPath($Ledger) -ne (Join-Path $root 'browser-ledger.json')){throw 'Owned805 ledger/path proof failed'}
if($record.ownerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'Different resource owner SID'}
function Test-OwnedChrome($process){
 if(!$process -or $process.Name -ne 'chrome.exe' -or !$process.CommandLine){return $false}
 if($process.CommandLine -notmatch '--user-data-dir=(?:"([^"]+)"|([^\s]+))'){return $false}
 $actual=if($Matches[1]){$Matches[1]}else{$Matches[2]}
 return [string]::Equals($actual,$qaProfilePath,[StringComparison]::OrdinalIgnoreCase)
}
$watchLedger=Join-Path $root 'watchdog-ledger.json'
if($Watchdog){
 if($TtlSeconds -ne $record.ttlSeconds -or $TtlSeconds -lt 60 -or $TtlSeconds -gt 1800){throw 'WatchdogTTL mismatch'}
 $self=Get-CimInstance Win32_Process -Filter "ProcessId=$PID"
 [pscustomobject]@{pid=$PID;created=$self.CreationDate.ToUniversalTime().ToString('o');script=(Join-Path $root 'pc-cleanup.ps1')}|ConvertTo-Json|Set-Content -Encoding UTF8 $watchLedger
 Start-Sleep -Seconds $TtlSeconds
 # Re-read late browser metadata, but never trust an arbitrary replacement path.
 $latest=Get-Content -Raw $Ledger|ConvertFrom-Json
 if($latest.root -ne $root -or $latest.profile -ne $qaProfilePath -or $latest.ownerSid -ne $record.ownerSid){throw 'Ledger changed identity'}
 $record=$latest
}
$stopped=@();$remaining=@();$failures=@()
# Every stopped PID is verified CURRENT chrome + exact unique user-data-dir + start time.
$own=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"|Where-Object {(Test-OwnedChrome $_) -and $_.CreationDate.ToUniversalTime() -ge [DateTime]::Parse($record.startedUtc).ToUniversalTime()})
foreach($process in $own){
 $current=Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ProcessId)" -ErrorAction SilentlyContinue
 if(!$current -or $current.CreationDate -ne $process.CreationDate -or !(Test-OwnedChrome $current)){continue}
 try{Stop-Process -Id $current.ProcessId -Force -ErrorAction Stop;$stopped+=$current.ProcessId}catch{$failures+='Could not stop own PID '+$current.ProcessId}
}
Start-Sleep -Milliseconds 500
$remaining=@(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"|Where-Object {Test-OwnedChrome $_}|Select-Object -ExpandProperty ProcessId)
if(!$remaining.Count -and (Test-Path $qaProfilePath)){try{Remove-Item -LiteralPath $qaProfilePath -Recurse -Force -ErrorAction Stop}catch{$failures+='Ownprofile remains locked; no foreign process stopped'}}
if(!$Watchdog -and (Test-Path $watchLedger)){
 $watch=Get-Content -Raw $watchLedger|ConvertFrom-Json;$p=Get-CimInstance Win32_Process -Filter "ProcessId=$($watch.pid)" -ErrorAction SilentlyContinue
 if($p -and $p.ProcessId -ne $PID -and $p.Name -eq 'powershell.exe' -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $watch.created -and $p.CommandLine.Contains((Join-Path $root 'pc-cleanup.ps1'))){Stop-Process -Id $p.ProcessId -Force}
}
[pscustomobject]@{owner='805-flow';atUtc=[DateTime]::UtcNow.ToString('o');stoppedPids=$stopped;remainingOwnProfilePids=$remaining;profileRemoved=!(Test-Path $qaProfilePath);failures=$failures;watchdog=[bool]$Watchdog}|ConvertTo-Json|Set-Content -Encoding UTF8 (Join-Path $root 'cleanup.json')
Get-Content -Raw (Join-Path $root 'cleanup.json')
