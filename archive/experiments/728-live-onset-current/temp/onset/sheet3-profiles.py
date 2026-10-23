import pathlib,json,gzip,collections
root=pathlib.Path(__file__).resolve().parent/'sheet3-stage-first'
r=json.loads((root/'report.json').read_text())
profiles=[]
for arm in r['arms']:
 planes=arm['planes']; seed=planes[0]; pr=next(x for x in seed['records'] if x['name']=='P');w,h=pr['read'][2:];N=w*h
 def raw(rec):return gzip.decompress((root/rec['file']).read_bytes())
 def mask(rec,c):a=raw(rec);return [a[4*i+c]>0 for i in range(N)]
 def signed(m):
  d=[N]*N;q=collections.deque()
  for i in range(N):
   x=i%w;y=i//w
   ns=[j for j in [i-1 if x else -1,i+1 if x+1<w else -1,i-w if y else -1,i+w if y+1<h else -1] if j>=0]
   if any(m[j]!=m[i] for j in ns):d[i]=0;q.append(i)
  while q:
   i=q.popleft();x=i%w;y=i//w
   for j in [i-1 if x else -1,i+1 if x+1<w else -1,i-w if y else -1,i+w if y+1<h else -1]:
    if j>=0 and d[j]>d[i]+1:d[j]=d[i]+1;q.append(j)
  return [-d[i]-1 if m[i] else d[i] for i in range(N)]
 boundaries={'original-P':signed(mask(pr,1)),'wet-V':signed(mask(next(x for x in seed['records'] if x['name']=='V'),0))}
 for plane in planes:
  data={x['name']:raw(x) for x in plane['records']}; rows={}
  for boundary,dist in boundaries.items():
   bins={}
   for i,k in enumerate(dist):
    if -20<=k<=20:
     v=bins.setdefault(k,[0,0,0,0,0,0]);v[0]+=1;v[1]+=data['P'][4*i+1];v[2]+=data['C'][4*i+3];v[3]+=data['V'][4*i];v[4]+=data['coverage'][4*i+1];v[5]+=data['cost'][4*i]
   rows[boundary]={k:{'n':v[0],'P_b':v[1]/v[0],'C_a':v[2]/v[0],'V_r':v[3]/v[0],'coverage_g':v[4]/v[0],'cost_r':v[5]/v[0]} for k,v in bins.items()}
  profiles.append({'phase':arm['phase'],'stage':plane['label'],'profiles':rows})
(root/'boundary-profiles.json').write_text(json.dumps({'scope':'slotROI only, Manhattan signed distance from original source support and wetV boundary; no global mass claim','profiles':profiles},indent=2))
print('profiles',len(profiles))
