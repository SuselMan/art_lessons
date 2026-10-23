from pathlib import Path
import secrets,re,os,json,hashlib,time
conf=Path('/etc/nginx/snippets/grafetto-logo-dev.conf');old=conf.read_text();private=Path('/home/suselman/.local/share/project-services/watercolor-qa');private.mkdir(exist_ok=True)
assert 'grafetto_async_pressure23_access' not in old
match=re.search(r'location\s*=\s*([^\s{]+)\s*\{[^}]*grafetto_first_live_warm_access[^}]*\}',old,re.S);assert match
oldblock=match.group();oldcookie=re.search(r'add_header Set-Cookie "([^";]+)',oldblock).group(1);token=secrets.token_urlsafe(32);route='/__qa_native_async_pressure23_'+secrets.token_urlsafe(28);cookie='grafetto_async_pressure23_access='+token
newblock=oldblock.replace(match.group(1),route).replace(oldcookie,cookie).replace('wcFirstLiveWarmup=1;','wcFirstLiveWarmup=1&wcAsyncCarryPressure=1;')
oldif=re.search(r'    if \(\$cookie_grafetto_first_live_warm_access = "[^"]+"\) \{ set \$grafetto_dev_target http://127\.0\.0\.1:5371; set \$grafetto_dev_access 1; \}',old).group()
newif='    if ($cookie_grafetto_async_pressure23_access = "'+token+'") { set $grafetto_dev_target http://127.0.0.1:5372; set $grafetto_dev_access 1; }'
new=old.replace(oldblock,newblock+'\n\n'+oldblock,1).replace(oldif,oldif+'\n'+newif,1)
assert new.replace(newblock+'\n\n','',1).replace('\n'+newif,'',1)==old
backup=private/('nginx-before-async-pressure23-'+str(int(time.time()))+'.conf');backup.write_text(old);os.chmod(backup,0o600);os.chown(backup,1000,1000)
conf.write_text(new)
url=private/'native-room-async-pressure23.url';url.write_text('https://tools.pecni.com'+route+'\n');os.chmod(url,0o600);os.chown(url,1000,1000)
proof={'oldConfigSha256':hashlib.sha256(old.encode()).hexdigest(),'newConfigSha256':hashlib.sha256(new.encode()).hexdigest(),'oldRoutesRetainedExactly':True,'newLoopbackPort':5372,'backupPath':str(backup)};p=private/'async-pressure23-route-proof.json';p.write_text(json.dumps(proof,indent=2));os.chmod(p,0o600);os.chown(p,1000,1000);print(json.dumps(proof))
