import json,gzip,collections
w,h=354,266;n=w*h;r=gzip.decompress(open('temp/onset/sheet3-cpu-fields/ON-pre-carry-P.rgba.gz','rb').read());m=[r[4*i+3]>0 for i in range(n)];d=[n]*n;q=collections.deque()
for i in range(n):
 x,y=i%w,i//w
 ns=[j for j in [i-1 if x else -1,i+1 if x+1<w else -1,i-w if y else -1,i+w if y+1<h else -1] if j>=0]
 if any(m[j]!=m[i] for j in ns):d[i]=0;q.append(i)
while q:
 i=q.popleft();x,y=i%w,i//w
 for j in [i-1 if x else -1,i+1 if x+1<w else -1,i-w if y else -1,i+w if y+1<h else -1]:
  if j>=0 and d[j]>d[i]+1:d[j]=d[i]+1;q.append(j)
d=[-d[i]-1 if m[i] else d[i] for i in range(n)];result=[]
for mode in ['positiveOnly','independent','mirroredPositive']:
 a=json.load(open('temp/onset/face-costpath-'+mode+'.json'));p={}
 for k in [-10,-5,-2,-1,0,1,2,5,10]:
  z=[a[i] for i in range(n) if d[i]==k];p[k]=round(sum(z)/len(z),2)
 ind=[i for i,v in enumerate(a) if v>=1];box=[min(i%w for i in ind),min(i//w for i in ind),max(i%w for i in ind),max(i//w for i in ind)]
 row={'mode':mode,'profile':p,'outsideMass':round(sum(a[i] for i in range(n) if not m[i]),2),'support':len(ind),'box':box};result.append(row);print(row)
json.dump(result,open('temp/onset/face-costpath-profile-report.json','w'),indent=2)
