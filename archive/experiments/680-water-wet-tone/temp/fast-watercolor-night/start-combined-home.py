from pathlib import Path
import tarfile,subprocess,os
base=Path('/home/suselman/projects/pencil-agents/680-lifetime-hardware')
root=base/'temp/combined-87f'
root.mkdir(exist_ok=True)
with tarfile.open(base/'temp/combined-87f.tar') as t:t.extractall(root,filter='data')
for where,target in [(root/'node_modules',base/'node_modules'),(root/'apps/web/node_modules',base/'apps/web/node_modules')]:
 if not where.exists():where.symlink_to(target,target_is_directory=True)
import shutil
shutil.copytree(base/'temp/safe-pack-ffd/apps/web/public/paper',root/'apps/web/public/paper',dirs_exist_ok=True)
p=root/'apps/web/vite.config.ts'
s=p.read_text();s=s.replace('defineConfig({','defineConfig({\n resolve: { alias: { "@grafetto/shared": "'+str(root/'packages/shared/src/index.ts')+'" } },',1);p.write_text(s)
log=open(base/'temp/combined-87f.log','a')
env=dict(os.environ,SERVER_PORT='4539',VITE_QA_JOINED_TOUCH='1')
proc=subprocess.Popen(['/home/suselman/.nvm/versions/node/v22.20.0/bin/node',str(base/'node_modules/vite/bin/vite.js'),'--host','--port','5347','--strictPort'],cwd=root/'apps/web',env=env,stdout=log,stderr=log,start_new_session=True)
print(proc.pid)
