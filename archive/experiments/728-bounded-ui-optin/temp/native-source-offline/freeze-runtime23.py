from pathlib import Path
import subprocess,tarfile,hashlib,json,os
root=Path('/home/suselman/projects/pencil-agents/680-water-wet-tone');own=Path('/home/suselman/projects/pencil-agents/728-bounded-ui-optin');base=own/'temp/native-source-offline';head=subprocess.check_output(['git','rev-parse','23f5ebb8'],cwd=root,text=True).strip();out=base/'runtime-room-23f5ebb8'
assert not out.exists();out.mkdir()
process=subprocess.Popen(['git','archive','--format=tar',head,'apps/web','packages/shared','package.json','package-lock.json'],cwd=root,stdout=subprocess.PIPE)
with tarfile.open(fileobj=process.stdout,mode='r|') as archive:archive.extractall(out,filter='data')
assert process.wait()==0
rows=[]
for p in sorted(out.rglob('*')):
 if p.is_file():
  data=p.read_bytes();rows.append({'path':str(p.relative_to(out)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest={'head':head,'freeze':'git archive fixed object, no mutable worktree copy','files':rows};(base/(out.name+'-manifest.json')).write_text(json.dumps(manifest,indent=2));os.chmod(base/(out.name+'-manifest.json'),0o600)
for path,target in [(out/'node_modules',root/'node_modules'),(out/'apps/web/node_modules',root/'apps/web/node_modules'),(out/'apps/web/public/paper',(base/'runtime-room-92e0626a/apps/web/public/paper').resolve())]:
 if path.is_dir() and not path.is_symlink():assert not list(path.iterdir());path.rmdir()
 path.symlink_to(target,target_is_directory=True)
paper=json.loads((base/'runtime-room-92e0626a-paper-manifest.json').read_text());paper['sourceReuse']='Immutable existing paper assets from fa86, verified identical bytes; no copy';(base/(out.name+'-paper-manifest.json')).write_text(json.dumps(paper,indent=2));os.chmod(base/(out.name+'-paper-manifest.json'),0o600)
origin={'head':head,'origin':'https://tools.pecni.com','trustedOrigin':'https://tools.pecni.com','sourceOrigin':'http://127.0.0.1:5372','paperLaSha256':'aeaef351114f00eb372208f68ff9ed809ab4cd3d0c86c02bb60e31fb21df8521'};(base/(out.name+'-origin-manifest.json')).write_text(json.dumps(origin,indent=2));os.chmod(base/(out.name+'-origin-manifest.json'),0o600)
print(json.dumps({'head':head,'fileCount':len(rows),'trackedBytes':sum(r['bytes'] for r in rows),'path':str(out)}))
