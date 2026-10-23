import pathlib,json,itertools,hashlib
r=pathlib.Path('temp/wc-runs/overnight-next/integer-paired-allocation');p=r/'production-physical22-brush-integer-fivebins-fixedties-snap-substeps-bound9.json';d=json.loads(p.read_text());sh=next(x['after'] for x in d['runtimePatches'] if x['kind']=='shader-exact' and 'uniform vec2 u_texel;' in x['after']);after=sh.replace('int chosen, int rotate)', 'int chosen, vec4 priorities, float stayPriority)').replace('mod(float(chosen-rotate)+5.0,5.0)','binComponent(priorities,stayPriority,chosen)').replace('mod(float(k-rotate)+5.0,5.0)','binComponent(priorities,stayPriority,k)')
old='''    // Stable tie order initially; spatial rotation not enabled until world anchoring available.
    int rotate=0;'''
new='''    // Canonical-field donor grid. Translation/recentering pattern changes are explicit.
    vec2 cell=floor(donor/u_texel);
    float state=mod(mod(cell.x,120.0)+37.0*mod(cell.y,120.0),120.0);
    vec4 available=vec4(1.0), priorities=vec4(0.0);float availableStay=1.0,stayPriority=0.0;
    for(int position=0;position<5;position++) {
      float divisor=position==0?24.0:(position==1?6.0:(position==2?2.0:1.0));
      float nth=floor(state/divisor);state-=nth*divisor;
      float seen=0.0;int selected=4;
      for(int candidate=0;candidate<5;candidate++) {
        float alive=binComponent(available,availableStay,candidate);
        if(alive>0.5){if(seen==nth)selected=candidate;seen+=1.0;}
      }
      if(selected==0){priorities.x=float(position);available.x=0.0;}
      else if(selected==1){priorities.y=float(position);available.y=0.0;}
      else if(selected==2){priorities.z=float(position);available.z=0.0;}
      else if(selected==3){priorities.w=float(position);available.w=0.0;}
      else {stayPriority=float(position);availableStay=0.0;}
    }'''
assert old in after;after=after.replace(old,new).replace(',rotate)',',priorities,stayPriority)');assert 'int rotate' not in after
# Verify factoradic enumeration, tie subset winners uniform.
perms=[]
for state in range(120):
 available=list(range(5));perm=[];s=state
 for divisor in [24,6,2,1,1]:n=s//divisor;s%=divisor;perm.append(available.pop(n))
 perms.append(perm)
assert len(set(map(tuple,perms)))==120
for mask in range(1,32):
 subset=[i for i in range(5) if mask>>i&1];counts={i:0 for i in subset}
 for perm in perms:counts[next(i for i in perm if i in subset)]+=1
 assert len(set(counts.values()))==1,(mask,counts)
d['id']='production-physical22-brush-integer-fivebins-permutation120-snap-substeps-bound9';d['parentSpecSHA256']=hashlib.sha256(p.read_bytes()).hexdigest();d['runtimePatches'].append(dict(kind='shader-exact',selector='uniform sampler2D u_paint, u_flow, u_water, u_pigment;',before=sh,after=after,countPerShader=1));d['observableOutcome']='Full120 donor-specific permutation tie priorities on canonical field cells; same integer snapped/substeps allocation, source geometry unchanged.';d['risks']=['Balanced ensemble120, not unbiased individual image','Canonical field recenter/translation changes priority pattern; not world-origin invariant','Spatial120-cell pattern may remain visible','Mixed7 forbidden until input-cone resolution','Factoradic extra25 small integer comparisons per donor; realGL untested'];(r/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n');(r/'permutation120-proof.json').write_text(json.dumps({'permutations':120,'unique':120,'all31NonemptyTieSubsetsUniformWinner':True,'patches':len(d['runtimePatches']),'modulePatchesUnchangedFrom29':True},indent=2)+'\n');print(len(d['runtimePatches']))
