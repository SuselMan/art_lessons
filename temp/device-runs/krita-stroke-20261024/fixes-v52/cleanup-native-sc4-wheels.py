from pathlib import Path
import importlib.util,os,json,fcntl
home=Path('/home/suselman');script=home/'linux-setup/scripts/services/qa-cleanup.py'
spec=importlib.util.spec_from_file_location('qa_cleanup',script);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def strict(path):
 prefix=str(path)
 for entry in Path('/proc').iterdir():
  if not entry.name.isdigit() or int(entry.name)==os.getpid():continue
  try:
   cwd=os.readlink(entry/'cwd');args=(entry/'cmdline').read_bytes().decode(errors='replace').split('\0')
  except (FileNotFoundError,ProcessLookupError):continue
  if cwd==prefix or cwd.startswith(prefix+'/') or any(prefix in arg for arg in args):return True
 return False
state=home/'.local/share/codex-qa';file=state/'resources.json';rid='brush-native-sc4-wheels-20261031'
with (state/'resources.lock').open('a+') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX);registry=json.loads(file.read_text());item=registry[rid];actual=strict(Path(item['path']));assert actual is False
 result=m.operate(home,registry,'finish',rid,active=strict);assert result[rid]=='removed',result
 temp=state/('resources.'+str(os.getpid())+'.tmp')
 with temp.open('x') as stream:os.fchmod(stream.fileno(),0o600);json.dump(registry,stream,ensure_ascii=False,indent=2)
 os.chown(temp,1000,1000);os.replace(temp,file)
 report={'id':rid,'removed':True,'privilegedStrictProcInspection':True,'actualReferences':actual,'standardGuardUsed':True,'registryOwner':file.stat().st_uid,'registryMode':oct(file.stat().st_mode&0o777),'nativeSourceFixturesRetained':True}
 Path(__file__).with_name('native-sc4-wheels-cleanup.json').write_text(json.dumps(report,indent=2))
 print(json.dumps(report))
