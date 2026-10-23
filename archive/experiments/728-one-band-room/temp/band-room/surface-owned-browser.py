#!/usr/bin/env python3
"""CPU-prepared helper; census by default. Explicit start/cleanup only own profile/task."""
import argparse,base64,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('action',choices=['census','start','cleanup']);p.add_argument('--nonce',required=True);p.add_argument('--port',type=int,default=9345);a=p.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9_-]{3,60}',a.nonce) or not 1024<=a.port<=65535:raise SystemExit('invalid own identity')
profile='C:\\ProgramData\\grafetto\\qa728-'+a.nonce;task='Grafetto728-'+a.nonce
common="$ProgressPreference='SilentlyContinue';"
if a.action=='census':
 code=common+" @{freeKiB=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory; browsers=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('chrome.exe','msedge.exe')} | Select-Object ProcessId,Name,CommandLine)} | ConvertTo-Json -Depth 4 -Compress"
elif a.action=='start':
 code=common+" if(@(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('chrome.exe','msedge.exe')}).Count -ne 0){throw 'Existing browser: coordinate owner'};"+f" $a=New-ScheduledTaskAction -Execute 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' -Argument '--user-data-dir={profile} --remote-debugging-port={a.port} --ignore-certificate-errors --no-first-run --no-default-browser-check about:blank'; $p=New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName '{task}' -Action $a -Principal $p -Force | Out-Null; Start-ScheduledTask -TaskName '{task}'; @{{task='{task}';profile='{profile}';port={a.port}}} | ConvertTo-Json -Compress"
else:
 code=common+f" $p=@(Get-CimInstance Win32_Process | Where-Object {{$_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*--user-data-dir={profile} *' -and $_.CommandLine -like '*--remote-debugging-port={a.port}*' -and $_.CommandLine -notlike '*--type=*'}}); $p | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress; foreach($x in $p){{Stop-Process -Id $x.ProcessId}}; Unregister-ScheduledTask -TaskName '{task}' -Confirm:$false; (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory"
result=subprocess.run(['ssh','-o','BatchMode=yes','surface','powershell.exe -NoProfile -EncodedCommand '+base64.b64encode(code.encode('utf-16le')).decode()],capture_output=True,timeout=25)
print(result.stdout.decode('utf-8',errors='replace'))
if result.returncode:print(result.stderr.decode('utf-8',errors='replace')[:1000]);raise SystemExit(result.returncode)
