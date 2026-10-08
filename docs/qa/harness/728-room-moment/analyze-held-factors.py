"""Scientific Q8 comparisons. Exact differences are observations, not tolerances.
Usage: python3 analyze-held-factors.py <factorGateDir> <actual5359Dir>.
Only isolated FIRST pigment P.B is comparable; available wet was substituted.
"""
import hashlib,json,math,pathlib,struct,sys,zlib

def png(path,w,h,pixels):
 def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
 raw=b''.join(b'\0'+bytes(pixels[y*w:(y+1)*w]) for y in range(h))
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,0,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

def grayscale_png(path):
 b=path.read_bytes();pos=8;data=b'';w=h=None
 while pos<len(b):
  n=struct.unpack('>I',b[pos:pos+4])[0];kind=b[pos+4:pos+8];v=b[pos+8:pos+8+n];pos+=12+n
  if kind==b'IHDR':
   w,h,depth,color,*_=struct.unpack('>IIBBBBB',v)
   if depth!=8 or color!=0:raise ValueError('Only our unfiltered scientific grayscale PNG supported')
  if kind==b'IDAT':data+=v
 raw=zlib.decompress(data)
 if any(raw[y*(w+1)] for y in range(h)):raise ValueError('Unexpected PNG filter')
 return w,h,[v for y in range(h) for v in raw[y*(w+1)+1:(y+1)*(w+1)]]

def difference(a,b):
 if len(a)!=len(b):raise ValueError('Matched ROI length required')
 d=[abs(x-y) for x,y in zip(a,b)];ma=sum(a)/len(a);mb=sum(b)/len(b)
 denominator=math.sqrt(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))
 return {'exact':not any(d),'different':sum(v!=0 for v in d),'max':max(d),'meanAbsolute':sum(d)/len(d),'correlation':sum((x-ma)*(y-mb) for x,y in zip(a,b))/denominator if denominator else None}

def analyze(gate,actual):
 report=json.loads((gate/'report.json').read_text())
 if not report.get('valid'):raise ValueError('Factor capture not valid')
 if report['roi']!={'x':384,'yTop':352,'w':96,'h':96}:raise ValueError('Expected bounded ROI')
 groups={}
 for g in report['groups']:
  b=(gate/(g['group']+'.rgba')).read_bytes()
  if len(b)!=36864 or hashlib.sha256(b).hexdigest()!=g['sha256']:raise ValueError('Factor payload SHA/budget mismatch')
  groups[g['group']]=b
 meta=json.loads((actual/'moment-stages.json').read_text())[1]
 roi={'x':meta['operatorRect']['x']+meta['capture']['x'],'yTop':meta['operatorRect']['y']+meta['capture']['y'],'w':96,'h':96}
 if roi!=report['roi']:raise ValueError('Actual source crop differs')
 raw=(actual/meta['stages'][0]['file']).read_bytes()
 if len(raw)!=36864:raise ValueError('Expected first pigment P RGBA crop')
 observed=list(raw[2::4]);baseline=list(groups['amount'][2::4]);counter=list(groups['no-tip-counterfactual'][2::4]);tip=list(groups['contact'][2::4]);nib=list(groups['contact'][0::4])
 wp,hp,predicted=grayscale_png(actual/'held-1-predictedPB.png')
 if (wp,hp)!=(96,96):raise ValueError('Analytic candidate size mismatch')
 samples=[]
 for x,y in [(457,439),(458,439),(459,439)]:
  i=(y-352)*96+x-384
  samples.append({'x':x,'yTop':y,'actualPB':observed[i],'isolatedPB':baseline[i],'analyticPB':predicted[i],'nibQ8':nib[i],'tipQ8':tip[i],'noTipPB':counter[i],'cloudOver2Q8':groups['modulation'][i*4],'settlingOver2Q8':groups['modulation'][i*4+1],'blotOver2Q8':groups['modulation'][i*4+2]})
 result={'roi':roi,'isolatedVsActualPB':difference(baseline,observed),'isolatedVsAnalyticPB':difference(baseline,predicted),'noTipVsIsolatedPB':difference(counter,baseline),'zeroInteriorPB':sum(v==0 and n==255 for v,n in zip(baseline,nib)),'zeroInteriorPBAndTip0':sum(v==0 and n==255 and t==0 for v,n,t in zip(baseline,nib,tip)),'zeroInteriorPBBecomesPositiveWithoutTip':sum(v==0 and n==255 and c>0 for v,n,c in zip(baseline,nib,counter)),'zeroTipWithPositivePB':sum(t==0 and v>0 for t,v in zip(tip,baseline)),'criticalPixels':samples,'scope':'First isolated pigment only. Q8 substituted outputs may alter compiler precision. P.G uses zero available coverage. No tolerance gate, no proposed default or artistic verdict.'}
 for name,values in [('actualPB',observed),('isolatedPB',baseline),('analyticPB',predicted),('noTipPB',counter),('tipQ8',tip),('nibQ8',nib),('cloudOver2Q8',list(groups['modulation'][::4])),('settlingOver2Q8',list(groups['modulation'][1::4])),('blotOver2Q8',list(groups['modulation'][2::4]))]:png(gate/(name+'.png'),96,96,values)
 (gate/'analysis.json').write_text(json.dumps(result,indent=2));return result
if __name__=='__main__':print(json.dumps(analyze(pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]))))
