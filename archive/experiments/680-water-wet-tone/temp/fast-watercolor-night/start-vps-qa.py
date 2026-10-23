import os,json,secrets,subprocess
from pathlib import Path
from urllib.parse import quote
root=Path.cwd();envrows=json.loads(subprocess.check_output(['docker','inspect','grafetto_pg_728_callgraph'],text=True))[0]['Config']['Env'];db=dict(x.split('=',1) for x in envrows if '=' in x)
env=dict(os.environ,PORT='4558',NODE_ENV='development',JWT_SECRET=secrets.token_hex(32),DATABASE_URL='postgresql://'+quote(db.get('POSTGRES_USER','postgres'),safe='')+':'+quote(db['POSTGRES_PASSWORD'],safe='')+'@127.0.0.1:55549/'+quote(db.get('POSTGRES_DB',db.get('POSTGRES_USER','postgres')),safe='')+'?schema=public')
log=open(root/'temp/fast-watercolor-night/vps-server.log','a')
p=subprocess.Popen(['node','--import','tsx','src/index.ts'],cwd=root/'apps/server',env=env,stdout=log,stderr=log,start_new_session=True)
print(json.dumps({'pid':p.pid,'port':4558,'database':'isolated grafetto_pg_728_callgraph'}))
