import subprocess
root='/home/suselman/projects/pencil-agents/680-lifetime-hardware'
log=open(root+'/temp/night-overlay-http.log','a')
p=subprocess.Popen(['/home/suselman/.nvm/versions/node/v22.20.0/bin/node',root+'/node_modules/vite/bin/vite.js','--mode','http','--host','--port','5319','--strictPort'],cwd=root+'/temp/night-overlay/apps/web',env={**__import__('os').environ,'SERVER_PORT':'4537'},stdout=log,stderr=log,stdin=subprocess.DEVNULL,start_new_session=True)
print('Own temporary HTTP Vite PID',p.pid)
