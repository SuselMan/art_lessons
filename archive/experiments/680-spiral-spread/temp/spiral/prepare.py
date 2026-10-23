import json,base64,struct,copy,math
ops=json.load(open('/home/suselman/projects/pencil-agents/324-watercolor-transition/temp/wc-runs/spirals/ops.json'))
fields=['x','y','pressure','tiltX','tiltY','size','aspectRatio','angle','opacity','t']
def decode(o):return [dict(zip(fields,a)) for a in struct.iter_unpack('<10f',base64.b64decode(o['dabsPacked'].split(':',1)[1]))]
water=copy.deepcopy(next(o for o in ops if o['seq']==18));paint=copy.deepcopy(next(o for o in ops if o['seq']==19))
for o in [water,paint]:
 ds=decode(o)
 for d in ds:d['x']+=240-208.9;d['y']+=240-630.8
 del o['dabsPacked'];o['dabs']=ds;o['layerId']='spiral-proof';o['timestamp']=100000+o['seq']*100
 o['seq']=0 if o is water else 1
blob=copy.deepcopy(paint);d=max(paint['dabs'],key=lambda d:d['size']);d=copy.deepcopy(d);d['x']=435;d['y']=385;d['size']=115.3;d['pressure']=1
blob['dabs']=[{**d,'t':d['t']+i*16} for i in range(5)];blob['strokeId']='blob';blob['id']='blob';blob['wet']='f'*5
cases=[]
for name,pigment in [('spiral',paint),('blob',blob)]:
 for variant in ['baseline','no-carry','density-probe']:
  cases.append({'name':name+'-'+variant,'ops':[water,pigment],'noCarry':variant=='no-carry','densityProbe':variant=='density-probe','targetSeq':1})
json.dump(cases,open('temp/spiral/cases.json','w'))
