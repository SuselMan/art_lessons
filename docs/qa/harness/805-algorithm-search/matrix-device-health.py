#!/usr/bin/env python3
"""Read-only cached-device health snapshot; no GPU commands, wake, flags or network discovery."""
import pathlib,json,subprocess,re,datetime,sys
endpoint=json.loads(pathlib.Path.home().joinpath('.local/share/codex-portal/android-endpoint.json').read_text())['endpoint'];adb='/home/suselman/tools/platform-tools/adb';row={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'read-only thermalservice and battery; no device configuration changes'}
for name,service in [('thermal','thermalservice'),('battery','battery')]:
 try:p=subprocess.run([adb,'-s',endpoint,'shell','dumpsys',service],capture_output=True,text=True,timeout=15)
 except (subprocess.TimeoutExpired,OSError) as error:row[name+'ExitCode']=124;row[name+'Error']=type(error).__name__;continue
 row[name+'ExitCode']=p.returncode
 if p.returncode:row[name+'Error']='ADB read unavailable';continue
 if name=='thermal':
  m=re.search(r'Thermal Status:\s*(\d+)',p.stdout,re.I);row['thermalStatus']=int(m.group(1))if m else None
 else:
  row['battery']={k.strip():v.strip()for k,v in re.findall(r'^\s*(AC powered|USB powered|Wireless powered|status|level|scale|temperature):\s*(.*?)\s*$',p.stdout,re.M)}
p=pathlib.Path(sys.argv[1]);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(row,indent=2));p.chmod(0o600)
if any(row.get(k+'ExitCode')for k in ['thermal','battery']):raise SystemExit(1)
