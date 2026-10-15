import json,math,hashlib
from pathlib import Path

def dabs(points,size=180):
 return [{'x':x,'y':y,'size':size,'pressure':.8,'tiltX':0,'tiltY':0,'aspectRatio':1,'angle':0,'opacity':1,'t':i*12} for i,(x,y) in enumerate(points)]
def line(a,b,n=49):return [(a[0]+(b[0]-a[0])*i/(n-1),a[1]+(b[1]-a[1])*i/(n-1)) for i in range(n)]
def op(sid,n,paint,color,points,size=180,pigment=85,wet=None):
 ds=dabs(points,size)
 return {'id':f'{sid}-op-{n}','seq':n,'type':'stroke','tool':'watercolor','layerId':'L','userId':'fixture','timestamp':1000+n*500,'strokeId':f'{sid}-stroke-{n}','washId':f'{sid}-wash','preset':f'normal:100:{pigment}:{paint}:round:wc@front8-detail-flow-v4','color':[int(color[i:i+2],16)/255 for i in (0,2,4)],'dabs':ds,'wet':wet or '0'*len(ds)}
single=[op('single',1,'PB29','2a3b97',[(200+620*i/64,500+65*math.sin(i/64*math.pi*2)) for i in range(65)],180)]
first=line((240,280),(780,720));second=line((240,720),(780,280));wet=''.join('f' if abs(x/1.227272727-y+84.44)<130 else '0' for x,y in second)
cross=[op('cross',1,'PY35','f1e433',first,190),op('cross',2,'PB15','2688d3',second,190,85,wet)]
puddle=[op('puddle',1,'PB15','2688d3',line((380,500),(650,500),25),330,0),op('puddle',2,'PB29','2a3b97',[(510+i*2,495+i) for i in range(8)],100,100,'f'*8)]
cases=[{'id':'single','title':'Один мазок','ops':single},{'id':'cross','title':'Жёлтый и синий: пересечение','ops':cross},{'id':'puddle','title':'Капля в чистой воде','ops':puddle}]
p=Path(__file__).with_name('fixtures.json');p.write_text(json.dumps(cases,ensure_ascii=False,separators=(',',':')));print(hashlib.sha256(p.read_bytes()).hexdigest())
