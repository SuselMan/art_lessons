import json,subprocess,pathlib,sys
body=json.loads(pathlib.Path(sys.argv[1]).read_text())
remote="""import json,urllib.request
session=json.load(open('/home/suselman/projects/pencil-agents/680-lifetime-hardware/apps/web/node_modules/.devbridge/session-5326.json'))
body=BODY
q=urllib.request.Request('http://localhost:5326/__devbridge/eval',data=json.dumps(body).encode(),headers={'x-devbridge-token':session['token'],'content-type':'application/json'})
print(urllib.request.urlopen(q,timeout=body.get('timeoutMs',10000)/1000+10).read().decode())
""".replace('BODY',repr(body))
r=subprocess.run(['ssh','-o','BatchMode=yes','-i',str(pathlib.Path.home()/'.ssh/home_ed25519'),'-p','22022','suselman@127.0.0.1','python3 -'],input=remote,text=True,capture_output=True,timeout=body.get('timeoutMs',10000)/1000+25)
print(r.stdout);print(r.stderr,file=sys.stderr);sys.exit(r.returncode)
