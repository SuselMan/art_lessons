param([Parameter(Mandatory=$true)][string]$ResourceRoot,[int]$DebugPort=9238,[int]$TtlSeconds=900)
$ErrorActionPreference='Stop'
# Operator executes ONLY after GPU handoff. No user Chrome/task is stopped.
if($DebugPort -ne 9238 -or $TtlSeconds -lt 60 -or $TtlSeconds -gt 1800){throw 'Invalid owned port/TTL'}
$root=[IO.Path]::GetFullPath($ResourceRoot).TrimEnd('\')
if($root -notmatch '^C:\\Windows\\Temp\\grafetto805-flow-20261018-[a-zA-Z0-9-]+$'){throw 'Unique805 resource root required'}
if(!(Test-Path $root)){throw 'Copy the two PS scripts into the new owned root first'}
$qaProfilePath=Join-Path $root 'profile';$ledger=Join-Path $root 'browser-ledger.json';$cleanup=Join-Path $root 'pc-cleanup.ps1'
if((Test-Path $qaProfilePath) -or (Test-Path $ledger) -or !(Test-Path $cleanup)){throw 'Fresh root/profile and cleanup script required'}
if(Get-NetTCPConnection -LocalPort $DebugPort -State Listen -ErrorAction SilentlyContinue){throw 'Owned9238 port already occupied; do not stop its owner'}
function Test-OwnedChrome($process){
 if(!$process -or $process.Name -ne 'chrome.exe' -or !$process.CommandLine){return $false}
 if($process.CommandLine -notmatch '--user-data-dir=(?:"([^"]+)"|([^\s]+))'){return $false}
 $actual=if($Matches[1]){$Matches[1]}else{$Matches[2]}
 return [string]::Equals($actual,$qaProfilePath,[StringComparison]::OrdinalIgnoreCase)
}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl=Get-Acl $root;$acl.SetAccessRuleProtection($true,$false)
foreach($principal in @($sid,'S-1-5-18','S-1-5-32-544')){$identity=[System.Security.Principal.SecurityIdentifier]::new($principal);$rule=[System.Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)}
Set-Acl -Path $root -AclObject $acl
$chrome=@('C:\Program Files\Google\Chrome\Application\chrome.exe','C:\Program Files (x86)\Google\Chrome\Application\chrome.exe')|Where-Object {Test-Path $_}|Select-Object -First 1
if(!$chrome){throw 'InstalledChrome not found'}
[pscustomobject]@{owner='805-flow';ownerSid=$sid;root=$root;profile=$qaProfilePath;debugPort=$DebugPort;startedUtc=[DateTime]::UtcNow.ToString('o');ttlSeconds=$TtlSeconds;browserPid=$null;browserCreated=$null}|ConvertTo-Json|Set-Content -Encoding UTF8 $ledger
function Start-OwnedTask([string]$Executable,[string]$Arguments,[string]$Label){
 $name='Grafetto805-'+$Label+'-'+[Guid]::NewGuid().ToString('N');$registered=$false
 try{$action=New-ScheduledTaskAction -Execute $Executable -Argument $Arguments;$principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited;Register-ScheduledTask -TaskName $name -Action $action -Principal $principal|Out-Null;$registered=$true;Start-ScheduledTask -TaskName $name}
 finally{if($registered){Unregister-ScheduledTask -TaskName $name -Confirm:$false}}
}
# Independent TTL watchdog starts BEFORE Chrome, so launch failure/SSH detach is bounded.
$watchArgs='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$cleanup+'" -Ledger "'+$ledger+'" -Watchdog -TtlSeconds '+$TtlSeconds
Start-OwnedTask 'powershell.exe' $watchArgs 'Watchdog'
for($i=0;$i -lt 50 -and !(Test-Path (Join-Path $root 'watchdog-ledger.json'));$i++){Start-Sleep -Milliseconds 100}
if(!(Test-Path (Join-Path $root 'watchdog-ledger.json'))){throw 'Watchdog PID not proven; Chrome was not launched'}
$browserArguments='--user-data-dir="'+$qaProfilePath+'" --remote-debugging-address=127.0.0.1 --remote-debugging-port='+$DebugPort+' --no-first-run --no-default-browser-check --new-window about:blank'
Start-OwnedTask $chrome $browserArguments 'Chrome'
$browser=$null
for($attempt=0;$attempt -lt 100;$attempt++){
 $browser=Get-CimInstance Win32_Process -Filter "Name='chrome.exe'"|Where-Object {(Test-OwnedChrome $_) -and $_.CommandLine -notmatch '--type='}|Select-Object -First 1
 if($browser){break};Start-Sleep -Milliseconds 200
}
if(!$browser){throw 'Own Chrome root PID not observed; watchdog remains responsible for late launch'}
if($browser.SessionId -eq 0){throw 'OwnChrome is session0: not an interactive hardware proof; watchdog will clean'}
$record=Get-Content -Raw $ledger|ConvertFrom-Json;$record.browserPid=$browser.ProcessId;$record.browserCreated=$browser.CreationDate.ToUniversalTime().ToString('o');$record|ConvertTo-Json|Set-Content -Encoding UTF8 $ledger
$record|ConvertTo-Json -Compress
