import json,sys
for file in sys.argv[1:]:
 r=json.load(open(file));v=r.get('result',{})
 print(file,{k:r.get(k)for k in['targetId','ownTargetClosed','pass','error']})
 print({k:v.get(k)for k in['source','flags','canonicalAtTouch','pendingAtLift','pendingAtTouch','purple','gl','lost','prepareArgs']})
 for phase in ['dense-active','postlift-before-touch','newtouch-active','settle-tail']:
  fs=[f['dt']for f in v.get('frames',[])if f['phase']==phase];print(phase,{'frames':len(fs),'max':max(fs,default=0),'over33':sum(d>33 for d in fs),'over100':sum(d>100 for d in fs)})
 for key in ['Plan.prepare','_onEnd','_onStart','_finishRibbonStroke','_completeSettle']:
  cs=[c for c in v.get('calls',[])if c['name']==key];print(key,[{k:c[k]for k in['phase','dt','pendingBefore','pendingAfter']}for c in cs])
 print('ops',len(v.get('journal',[])))
