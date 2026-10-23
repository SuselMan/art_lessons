import json,pathlib,math
r=pathlib.Path('temp/wc-runs/overnight-next/helmholtz-contact-audit');fields=json.loads((r/'contact-fields.json').read_text());out=[]
for f in fields:
 w,h=f['w'],f['h'];N=w*h;p=f['pixels'];V=[((p[i*4]/255*2-1) if p[i*4+2]>0 else 0,(p[i*4+1]/255*2-1) if p[i*4+2]>0 else 0) for i in range(N)];B=[p[i*4+2]/255 for i in range(N)]
 for mode in ['meanVelocity','doseWeightedVelocity']:
  vec=V if mode=='meanVelocity' else [(v[0]*b,v[1]*b) for v,b in zip(V,B)];edges=[]
  for y in range(h):
   for x in range(w):
    i=y*w+x
    if x+1<w:edges.append((i,i+1,(vec[i][0]+vec[i+1][0])/2))
    if y+1<h:edges.append((i,i+w,(vec[i][1]+vec[i+w][1])/2))
  rhs=[0.]*N
  for i,j,q in edges:rhs[i]+=q;rhs[j]-=q
  def A(v):
   z=[0.]*N
   for i,j,q in edges:a=v[i]-v[j];z[i]+=a;z[j]-=a
   return z
  x=[0.]*N;res=rhs[:];d=res[:];rr=sum(a*a for a in res);init=rr
  for it in range(1000):
   ad=A(d);den=sum(a*b for a,b in zip(d,ad))
   if den<1e-25 or rr<1e-16*max(init,1):break
   alpha=rr/den;x=[a+alpha*b for a,b in zip(x,d)];res=[a-alpha*b for a,b in zip(res,ad)];new=sum(a*a for a in res);d=[a+new/rr*b for a,b in zip(res,d)];rr=new
  norm=sum(q*q for i,j,q in edges);left=sum((q-(x[i]-x[j]))**2 for i,j,q in edges);weak=sum((q-.25*(x[i]-x[j]))**2 for i,j,q in edges)
  curl=[]
  for y in range(1,h-1):
   for xx in range(1,w-1):i=y*w+xx;curl.append((vec[i+1][1]-vec[i-1][1]-(vec[i+w][0]-vec[i-w][0]))*.5)
  out.append({'case':f['case'],'contact':f['contact'],'grid':[w,h],'mode':mode,'closedBoundary':'zero projected normal flow; graph pressure with input boundary normal correction','edgeNorm':math.sqrt(norm),'projectedNormFraction':math.sqrt(left/norm) if norm else 0,'weak25NormFraction':math.sqrt(weak/norm) if norm else 0,'divergenceNorm':math.sqrt(init),'curlNormInterior':math.sqrt(sum(a*a for a in curl)),'CGiterations':it,'relativeResidual':math.sqrt(rr/init) if init else 0})
(r/'projection-stats.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
