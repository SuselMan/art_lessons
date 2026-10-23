import json,base64,struct,math,copy,hashlib
from pathlib import Path
r=Path(__file__).parent
inp=json.load(open(r.parent/'inputs.json'));case=next(x for x in inp['cases']if x['id']=='s6-n6');raw=[]
for op in case['ops']:raw.extend([list(v)for v in struct.iter_unpack('<10f',base64.b64decode(op['dabsPacked'].split(':')[1]))])
groups=[];start=0;distance=0;prev=None
for i,d in enumerate(raw):
 if prev:distance+=math.hypot(d[0]-prev[0],d[1]-prev[1])
 prev=d;radius=max(1,d[5]*.5)
 if distance>=radius*2:
  groups.append({'lo':start,'hi':i+1,'travel':distance,'endingRadius':radius});start=i+1;distance=0
  if len(groups)==16:break
prefix=raw[:groups[-1]['hi']]
def bbox(ds):
 vals=[]
 for d in ds:
  minor=d[5]*.5;long=minor*max(1,d[6]);co=abs(math.cos(d[7]));si=abs(math.sin(d[7]));hx=long*co+minor*si;hy=long*si+minor*co;vals.append([d[0]-hx,d[1]-hy,d[0]+hx,d[1]+hy])
 return[min(v[0]for v in vals),min(v[1]for v in vals),max(v[2]for v in vals),max(v[3]for v in vals)]
old=bbox(prefix);dx=512-(old[0]+old[2])/2;dy=512-(old[1]+old[3])/2
for d in prefix:d[0]+=dx;d[1]+=dy
bb=bbox(prefix);packed='1:'+base64.b64encode(b''.join(struct.pack('<10f',*d)for d in prefix)).decode();op=copy.deepcopy(case['ops'][0]);op['dabsPacked']=packed;op['id']+='-prefix16-r6';
if op.get('wet')is not None:op['wet']=op['wet'][:len(prefix)]
id='s6-prefix16-translated-singleTile-r6';new={'base':inp['base'],'cases':[{'id':id,'sheet':'6','n':6,'box':[math.floor(bb[0])-25,math.floor(bb[1])-25,math.ceil(bb[2])+25,math.ceil(bb[3])+25],'ops':[op]}]};(r/'s6-prefix16-r6-inputs.json').write_text(json.dumps(new,indent=2))
maxLong=max(d[5]*.5*max(1,d[6])for d in prefix);dryMargin=max(2,min(10,round(maxLong/5)))+2+math.ceil(maxLong)+2;finalPad=177+dryMargin
# Conservative >=actual first-kept gap plus AA/spread; deliberately loose+32padding, runtime actual guards authoritative.
interimBound=[bb[2]-bb[0]+64+4,bb[3]-bb[1]+64+4];finalBound=[bb[2]-bb[0]+64+2*finalPad,bb[3]-bb[1]+64+2*finalPad]
assert max(interimBound)<512 and max(finalBound)<1024
for control in [False,True]:
 spec=json.load(open(r/('causal-fast-zero-r4.json'if control else'causal-fast-interleave-r4.json')));spec['id']='causal-fast-'+('zero'if control else'interleave')+'-s6-sixteen-r6'
 if not control:
  spec['runtimePatches'][2]['after']='globalThis.__wcCausalZeroControl = false;\n'+spec['runtimePatches'][2]['after']
  spec['runtimePatches'][6]['after']='globalThis.__wcCausalZeroControl = false;\n'+spec['runtimePatches'][6]['after']
 for p in spec['runtimePatches']:
  p['after']=p['after'].replace('const maxGroups = 4;','const maxGroups = 16;')
 spec.update({'scope':'ONE blank-tile dense6 EXACT16 worlddistance groups only, newR6ID; preservesR4allfiles.','mechanism':'Existing R4fastinterim source/contact and onefinalfullsettle; ADDsource samegroup geometry bothpaths, onlyinterimcontacts differ. Sameoptics85parent shared, notproductionbaseline.', 'control':'Compare ONLY sameR6groupedZERO vsR6causal; oldone-shot source geometry wasdifferent and isnotcontrol.','safety':{'maxGroups':16,'interimActiveMax':512,'S':1,'singleTile':True,'canonicalField':[1536,1536],'newTextures':0,'existingFieldMiB':90,'clearLogicalUpperMiB':2592,'clearLogicalUpperGiB':2.53125,'finalNormalSettle':1,'originalBlankAlpha':0,'previousSettledAlpha':0}, 'limitations':['Initialsameinputsource kernel geometry identical; causalcontactchangesexistingink beforefuture sources bydesign.','Compare groupedZERO only; repeated group ADD source isnotproduction MAXgeometry.','Translatedcoordinates alter worldpaper/noise relativetooriginal; bothpaths samecoordinates, no originalPNGclaim.','Runtimeactiveguard isauthoritative; CPUconservativebound predictsinterim<512 andfinal<1024/S1.','NoGPUauthorization granted byspec; rootreviewrequired.','Canonicalclears remain1536²;16groupslogical≤2.6GiB plusfinalfullsettle, no90groups.'], 'status':'Readyforrootreview; NOT GPUrun', 'geometryAuditFile':str(r/'s6-prefix16-r6-geometry.json')})
 (r/(spec['id']+'.json')).write_text(json.dumps(spec,indent=2))
audit={'inputId':id,'rawOriginalCount':len(raw),'prefixCount':len(prefix),'durationMs':prefix[-1][9]-prefix[0][9],'groups':groups,'translation':[dx,dy],'translatedNibRect':bb,'maxLongRadius':maxLong,'interimActiveConservativeBound':interimBound,'finalActiveConservativeBound':finalBound,'finalPadUpper':finalPad,'radiusThresholdS2':48,'spanThresholdS2':1024,'S1Reason':'finalconservativeactive<1024, radius27<48 andspan<1024; nohalfres.','invariants':['pressure/time/size/aspect/angle/opacity float32original retained','positions translatedonly, repackfloat32minorrounding','prefixendsEXACT16distancegroups, no trailing seventeenthgroup','Original first turns retained, rawturnlist below','Allwetprofiles absent in original6','two runtime specs differonly__wcCausalZeroControl true/false'],'sourceInputSha256':hashlib.sha256((r.parent/'inputs.json').read_bytes()).hexdigest(),'runtimeGuard':'InterimS1,activew/h≤512,oneoverlap,canonical1536;scissorwithinactualactive. Finalfullpadnormal retained, existingcanonical cap1536.'}
(r/'s6-prefix16-r6-geometry.json').write_text(json.dumps(audit,indent=2));print(json.dumps(audit,indent=2))
