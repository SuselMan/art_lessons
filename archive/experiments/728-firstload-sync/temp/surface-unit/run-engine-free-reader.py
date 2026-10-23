import os,base64,json,subprocess,time,pathlib
root=pathlib.Path('temp/surface-unit');out=root/('engine-free-reader-'+str(int(time.time())));out.mkdir();(root/'reader-latest-out.txt').write_text(str(out))
enc=base64.b64encode('(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory'.encode('utf-16le')).decode()
e=os.environ.copy();e.update(WC_RELEASE_ROOT='/home/suselman/projects/pencil-agents/680-device-qa-guards',QA_GPU_GRANT='explicit-root-grant',QA_URL='https://192.168.1.70:5341',QA_SOURCE_PASSPORT='temp/ordinary-room-sync/source-passport-eligibility.json',QA_INPUT='/home/suselman/projects/pencil-agents/680-device-qa-guards/temp/room-KJc0OoVo/ops.json',QA_SEED_RECORD='temp/surface-unit/engine-free-durable47.json',QA_PRIVATE_AUTH='temp/surface-unit/reader-auth-1791388857315.json',QA_OUT=str(out),QA_REMOTE_CDP_URL='http://127.0.0.1:9452',QA_DEVICE_MEMORY_PROBE=json.dumps({'file':'ssh','args':['-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p22022','suselman@127.0.0.1','ssh surface "powershell -NoProfile -EncodedCommand '+enc+'"']}))
print(json.dumps({'OUT':str(out),'scope':'Existing normal engine-free47 room only, Surface reader, no seed','controllerPID':os.getpid()}),flush=True)
exitcode=1
try:
 with (out/'controller.log').open('w') as log: exitcode=subprocess.call(['node','docs/qa/harness/728-firstload/controller-engine-free.mjs'],env=e,stdout=log,stderr=subprocess.STDOUT,timeout=960)
finally:
 with (out/'cleanup.log').open('w') as log:
  subprocess.run(['python3','temp/surface-unit/cleanup-reader.py'],stdout=log,stderr=subprocess.STDOUT,check=True)
  code="import pathlib,json,os,signal; pids=json.loads(pathlib.Path('/home/suselman/projects/pencil-agents/680-puddle-outline/temp/firstload-engine-free-47/reader-forward-pid.json').read_text()); assert len(pids)==1; p=pids[0]; a=pathlib.Path('/proc/'+str(p)+'/cmdline').read_bytes().split(bytes([0])); assert b'-L127.0.0.1:9452:127.0.0.1:9352' in a and b'surface' in a; os.kill(p,signal.SIGTERM); print('OWN_HOME_FORWARD_CLOSED',p)"
  subprocess.run(['ssh','-o','BatchMode=yes','-i','/home/suselman/.ssh/home_ed25519','-p22022','suselman@127.0.0.1',"python3 -c "+__import__('shlex').quote(code)],stdout=log,stderr=subprocess.STDOUT,check=True)
 print(json.dumps({'OUT':str(out),'exitcode':exitcode,'OWNED_SURFACE_RESOURCES_CLOSED':True}),flush=True)
raise SystemExit(exitcode)
