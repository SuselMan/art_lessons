import json,base64,pathlib,sys,math,hashlib
r=pathlib.Path(sys.argv[1]);a=json.loads((r/'s9-n3-fullraw-groups16-capture.json').read_text());b=json.loads((r/'s9-n3-fullraw-oneshot-capture.json').read_text());out={'source':{},'contactTapesByteSemanticEqual':a['contacts']==b['contacts'],'travelTapesEqual':a['travel']==b['travel'],'groups':len(a['prefixes']),'oneshotGroups':len(b['prefixes'])}
for k in ['P','C','coverage']:
 x=base64.b64decode(a['prefixes'][-1][k]);y=base64.b64decode(b['prefixes'][-1][k]);out['source'][k]={'byteIdentity':x==y,'shaGrouped':hashlib.sha256(x).hexdigest(),'shaOneshot':hashlib.sha256(y).hexdigest(),'changedBytes':sum(x!=y for x,y in zip(x,y)),'maxCode':max(abs(x-y) for x,y in zip(x,y))}
for k in ['P','C']:
 prev=bytes(len(base64.b64decode(a['prefixes'][0][k])));out['source'][k]['prefixMonotone']=True
 for p in a['prefixes']:
  cur=base64.b64decode(p[k]);out['source'][k]['prefixMonotone'] &= all(x>=y for x,y in zip(cur,prev));prev=cur
ends=[];distance=0
for i,d in enumerate(a['travel']):
 if d['water']<=0 or math.hypot(d['dx'],d['dy'])<.01:raise ValueError('captured tape unexpectedly contains excludedtravel')
 distance+=math.hypot(d['dx'],d['dy'])
 if distance>=max(1,d['radius']*.5):ends.append(i+1);distance=0
if ends[-1]!=len(a['travel']):ends.append(len(a['travel']))
assert len(ends)==len(a['contacts']),'actual contactpartition differs known builder'
for p in a['prefixes']:p['contactEnd']=sum(end<=p['travelEnd'] for end in ends)
assert a['prefixes'][-1]['contactEnd']==len(a['contacts']);out['contactsAssignedByClosedTravelEnd']=ends;out['chronoClaimAllowed']=all(out['source'][k]['byteIdentity'] for k in ['P','C','coverage']) and out['contactTapesByteSemanticEqual'];out['limits']=['If groupedsource differs oneshot, chronology remains within matchedgrouped source only; not originalengine equivalence','No finalsettle/replay PNG here; SOURCE physical records only']
(r/'source-vs-oneshot-proof.json').write_text(json.dumps(out,indent=2)+'\n');(r/'raw-prefix-capture-with-contact-ends.json').write_text(json.dumps(a));print(json.dumps({k:v for k,v in out.items() if k!='contactsAssignedByClosedTravelEnd'},indent=2))
