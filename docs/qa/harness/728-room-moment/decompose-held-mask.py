"""Offline formula decomposition; double CPU arithmetic is NOT GPU bit parity.
Requires prepared candidates and actual source observer; no changes to shaders."""
import base64,json,math,pathlib,sys,zlib,struct
root=pathlib.Path(sys.argv[1]); repo=pathlib.Path(__file__).resolve().parents[4]
lattice=base64.b64decode((repo/'apps/web/src/engine/src/raster/watercolorNoise.txt').read_text())
def mix(a,b,t):return a+(b-a)*t
def smooth(a,b,v):
 t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def noise(p):
 i=[math.floor(x) for x in p];f=[p[k]-i[k] for k in (0,1)];u=[x*x*(3-2*x) for x in f]
 def h(x,y):return lattice[(y%251)*251+x%251]/255
 return mix(mix(h(*i),h(i[0]+1,i[1]),u[0]),mix(h(i[0],i[1]+1),h(i[0]+1,i[1]+1),u[0]),u[1])
def fbm(p):return .63*noise(p)+.37*noise([p[0]*2.7+31.4,p[1]*2.7+17.9])
def corr(a,b):
 ma=sum(a)/len(a);mb=sum(b)/len(b);n=sum((x-ma)*(y-mb) for x,y in zip(a,b));d=math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b));return n/d if d else None
actual_path=root/'actual-held-prepared.json';is_actual=actual_path.exists();records=json.loads((actual_path if is_actual else root/'held-prepared-candidates.json').read_text());meta=json.loads((root/'moment-stages.json').read_text());out=[]
def png(path,w,h,pixels):
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 payload=b''.join(b'\0'+bytes(pixels[y*w:(y+1)*w]) for y in range(h))
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(payload))+chunk(b'IEND',b''))
for ci in (1,2):
 candidate=records[ci if is_actual else ci*2];stamp=next(c['stamp'] for c in candidate['commands'] if c['phase']=='pigment');u=stamp['uniforms'];m=meta[ci];w,h=96,96;x0=m['operatorRect']['x']+m['capture']['x'];y0=m['operatorRect']['y']+m['capture']['y'];raw=(root/m['stages'][0]['file']).read_bytes();pb=list(raw[2::4]);factors={k:[] for k in ['tipContact','hair','opening','cloud','filmBlot','settling','nibCoverage','predictedPB','noTipCounterfactualPB']}
 for y in range(h):
  for x in range(w):
   position=[x0+x+.5,y0+y+.5];wp=[position[0]+u['worldOrigin'][0],1024-position[1]+u['worldOrigin'][1]];dx=position[0]-stamp['center'][0];dy=position[1]-stamp['center'][1];c=math.cos(stamp['angle']);s=math.sin(stamp['angle']);local=[(dx*c+dy*s)/(stamp['radius']*stamp['aspect']),(-dx*s+dy*c)/stamp['radius']];ax=stamp['acrossLocal'];a=max(-1,min(1,(local[0]*stamp['radius']*stamp['aspect']*ax[0]+local[1]*stamp['radius']*ax[1])/max(math.hypot(stamp['radius']*stamp['aspect']*ax[0],stamp['radius']*ax[1]),1e-4)))
   drift=fbm([wp[0]*.0012+71,wp[1]*.0012+13]);hair=fbm([a*u['bristleCombs']+3,drift*.9+29]);pressure=stamp['pressure'];light=1-smooth(.12,.70,pressure);release=1-smooth(.012,.060,pressure);threshold=mix(mix(.34,.39,light),.62,release);opening=smooth(.55,.72,noise([wp[0]*.009+37,wp[1]*.009+91]));tip=mix(1,smooth(threshold-.02,threshold+.02,hair),max(opening,release))*smooth(0,.012,pressure)
   seed=u['mottleSeed'];cloud=1+u['cloudDeposit']*(fbm([wp[k]*.018+seed[k] for k in (0,1)])-.5)*2;pool=u['poolBlot']*max(0,min(1,stamp['pigmentPool']));blot=1+pool*.85*(2*smooth(.3,.7,fbm([wp[0]*.055+seed[0]*1.7+13,wp[1]*.055+seed[1]*1.7+5]))-1)
   n=fbm([wp[0]*.11+seed[0]+19,wp[1]*.11+seed[1]+71])-.5;n=n*.5 if n<.05 else n*1.6;settling=max(1+u['granDeposit']*n*2,0)
   f=local[0]**2+local[1]**2;grad=math.hypot(2*local[0]/(stamp['radius']*stamp['aspect']),2*local[1]/stamp['radius']);distance=(f-1)/max(grad,1e-6);cov=max(0,min(1,-distance/u['aaPx']));depth=max(0,min(1,-distance/stamp['radius']*2));withoutTip=cov*mix(stamp['inkEdge'],1,depth)*stamp['opacity']*cloud*settling*blot;amount=withoutTip*tip;noTip=max(0,min(1,withoutTip*stamp['inkStrength']));predicted=max(0,min(1,amount*stamp['inkStrength']))
   for key,v in zip(factors,[tip,hair,opening,cloud,blot,settling,cov,predicted,noTip]):factors[key].append(v)
 for key,values in [('actual-PB',pb),*factors.items()]:
  pixels=values if key=='actual-PB' else [round(max(0,min(1,v))*255) for v in values]
  png(root/f'held-{ci}-{key}.png',w,h,pixels)
 out.append({'contact':ci,'preparedBasis':'actual queued census' if is_actual else candidate['anchoring'],'radius':stamp['radius'],'combs':u['bristleCombs'],'acrossLocal':ax,'approxHairCellSpacing':stamp['radius']/u['bristleCombs'],'correlationWithActualPB':{k:corr(pb,v) for k,v in factors.items()},'factorRanges':{k:[min(v),max(v)] for k,v in factors.items()},'predictedPBByteDiff':{'count':sum(v!=round(p*255) for v,p in zip(pb,factors['predictedPB'])),'max':max(abs(v-round(p*255)) for v,p in zip(pb,factors['predictedPB'])),'scope':'Single isolated first pigment analytic candidate only; previous colored base is NOT modeled'},'interiorZeroPBWhoseNoTipWouldBePositive':[{'x':x0+(i%w),'y':y0+i//w,'observedPB':v,'predictedPB':round(factors['predictedPB'][i]*255),'noTipPB':round(factors['noTipCounterfactualPB'][i]*255)} for i,v in enumerate(pb) if v==0 and factors['nibCoverage'][i]>=1 and round(factors['noTipCounterfactualPB'][i]*255)>0][:32],'zeroPB':sum(v==0 for v in pb),'zeroPBWithZeroTip':sum(v==0 and tip<1e-10 for v,tip in zip(pb,factors['tipContact'])),'zeroTipWithPositivePB':sum(v>0 and tip<1e-10 for v,tip in zip(pb,factors['tipContact'])),'scope':'Actual prepared uniforms with CPU double formula evaluation; not hardware interpolation/precision parity or causal proof'})
(root/'held-mask-decomposition.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
