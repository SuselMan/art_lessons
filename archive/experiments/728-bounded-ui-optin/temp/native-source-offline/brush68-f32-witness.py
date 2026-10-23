import json,gzip,base64,numpy as np,hashlib
packet_path='temp/device-runs/pre-brush68-4901-gl/packet.json';p=json.load(open(packet_path));roi=p['roi'];data={(r['phase'],r['role']):np.frombuffer(gzip.decompress(base64.b64decode(r['gzipBase64'])),dtype=np.uint8).reshape(108,127,4) for r in p['rows']};flow=np.frombuffer(gzip.decompress(base64.b64decode(p['flow']['gzipBase64'])),dtype=np.uint8).reshape(26,31,4);f=np.float32;t=f(1/1536);rect=np.array([272/1536,1170/1536,121/1536,102/1536],dtype=np.float32);gain=f(.6437950134277344)
def qv(x,y):return np.array([f(f(x+.5)*t),f(f(1535-y+.5)*t)],dtype=np.float32)
def uv_sample(role,u):
 x=int(np.floor(f(u[0]*f(1536))));y=1535-int(np.floor(f(u[1]*f(1536))));return data['before',role][y-roi['y'],x-roi['x']].astype(np.float32)/f(255)
def snap(u):return (np.floor(u/t).astype(np.float32)+f(.5))*t
def flow_at(u):
 l=(u-rect[:2])/rect[2:];
 if np.any(l<0) or np.any(l>1):return np.array([.5,.5,0],dtype=np.float32)
 xy=l*np.array([31,26],dtype=np.float32)-f(.5);cell=np.floor(xy).astype(int);w=xy-cell.astype(np.float32)
 def at(dx,dy):return flow[np.clip(cell[1]+dy,0,25),np.clip(cell[0]+dx,0,30),:3].astype(np.float32)/f(255)
 a=at(0,0)*(f(1)-w[0])+at(1,0)*w[0];b=at(0,1)*(f(1)-w[0])+at(1,1)*w[0];return a*(f(1)-w[1])+b*w[1]
def fraction(a,b,direction):
 a=snap(a);b=snap(b);fa=flow_at(a);fb=flow_at(b);v=fa[:2]*f(2)-f(1);vb=fb[:2]*f(2)-f(1);donor=uv_sample('a',a)[3];neighbour=uv_sample('a',b)[3];mix=f(f(.02)*max(f(donor-neighbour),f(0))/max(donor,f(5e-5)));dose=min(fa[2],fb[2]);clock=f(-np.log(max(f(1)-dose,f(1/255))));dot=f(np.sum(f(.5)*(v+vb)*direction));raw=f(f(f(f(.3535533905932738)*gain)*abs(dot))*clock+mix*dose)
 P=np.floor(uv_sample('a',a)*f(255)+f(.5));C=np.floor(uv_sample('cc',a)*f(255)+f(.5));roomP=np.floor((f(255)-np.floor(uv_sample('a',b)*f(255)+f(.5)))/f(4));roomC=np.floor((f(255)-np.floor(uv_sample('cc',b)*f(255)+f(.5)))/f(4));lim=f(1);limits=[]
 for ch,(q,cap) in enumerate(zip(np.r_[P,C],np.r_[roomP,roomC])):
  l=f(1) if q<.5 or raw<=0 else min(f(1),f(cap/f(q*raw)));limits.append(float(l));lim=min(lim,l)
 fraction=f(raw*lim);prod=P*fraction
 return {'flowA':fa.tolist(),'flowB':fb.tolist(),'raw':float(raw),'limit':float(lim),'fraction':float(fraction),'P':P.tolist(),'C':C.tolist(),'roomP':roomP.tolist(),'roomC':roomC.tolist(),'channelLimits':limits,'PProduct':prod.tolist(),'PTransfer':np.floor(prod).astype(int).tolist(),'distanceToNearestInteger':float(min(abs(float(prod[0])-round(float(prod[0]))),1))}
rows=[]
for x,y in [(349,288),(350,288)]:
 uv=snap(qv(x,y));faces=[]
 for d in [(1,0),(-1,0),(0,1),(0,-1)]:
  direction=np.array(d,dtype=np.float32);other=snap(uv+direction*t);faces.append({'dir':d,'give':fraction(uv,other,direction),'take':fraction(other,uv,-direction)})
 old=data['before','a'][y-roi['y'],x-roi['x']].tolist();gl=data['after','a'][y-roi['y'],x-roi['x']].tolist();prediction=old[0]+sum(a['take']['PTransfer'][0]-a['give']['PTransfer'][0] for a in faces);rows.append({'x':x,'y':y,'oldP':old,'glAfter':gl,'idealF32CpuPrediction':prediction,'faces':faces})
out={'scope':'CPU F32 arithmetic with ideal non-fused bilinear flow, saturated wet gate. NOT hardware coefficients/texture filtering/transcendental proof.','producerCode':p['code'],'packetSha256':hashlib.sha256(open(packet_path,'rb').read()).hexdigest(),'rows':rows};open('temp/native-source-offline/brush68-f32-witness.json','w').write(json.dumps(out,indent=2));print([(r['x'],r['y'],r['oldP'][0],r['glAfter'][0],r['idealF32CpuPrediction'],[(x['dir'],x['give']['raw'],x['give']['limit'],x['give']['PProduct'][0]) for x in r['faces']]) for r in rows])
