import subprocess,base64
script='''$os=Get-CimInstance Win32_OperatingSystem;$cpu=Get-CimInstance Win32_Processor;$bat=Get-CimInstance Win32_Battery;[PSCustomObject]@{FreeMB=[math]::Round($os.FreePhysicalMemory/1024);TotalMB=[math]::Round($os.TotalVisibleMemorySize/1024);CpuLoad=$cpu.LoadPercentage;CpuClock=$cpu.CurrentClockSpeed;Battery=$bat.EstimatedChargeRemaining;BatteryStatus=$bat.BatteryStatus}|ConvertTo-Json;powercfg /GETACTIVESCHEME'''
encoded=base64.b64encode(script.encode('utf-16le')).decode()
r=subprocess.run(['ssh','-oBatchMode=yes','surface','powershell.exe','-NoProfile','-EncodedCommand',encoded],capture_output=True,text=True,errors="replace",timeout=30)
print(r.stdout);print(r.stderr[:500]);print('exit',r.returncode)
