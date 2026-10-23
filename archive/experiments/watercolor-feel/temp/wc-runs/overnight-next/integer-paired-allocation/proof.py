import numpy as np,json
rng=np.random.default_rng(103)
def allocate(total,bins):
 s=int(sum(bins))
 if not s: assert total==0;return np.zeros(5,dtype=int)
 assert total<=s
 numerator=total*bins;result=numerator//s;rem=numerator%s;left=total-int(result.sum())
 order=sorted(range(5),key=lambda k:(-int(rem[k]),k))
 for k in order[:left]:result[k]+=1
 assert result.sum()==total and np.all(result<=bins)
 return result
locked=0;examples=[]
for n in range(100000):
 A=int(rng.integers(1,256));B=int(rng.integers(0,A+1));D=int(rng.integers(0,B+1));R=int(rng.integers(0,A+1));f=rng.random(4);f*=.93/max(1,f.sum());moving=np.floor(A*f).astype(int);bins=np.r_[moving,A-moving.sum()];pb=allocate(B,bins);depth=allocate(D,pb);water=allocate(R,bins)
 assert np.all(depth<=pb) and np.all(pb<=bins) and np.all(water<=bins)
 locked+=int(moving.sum()==0)
 if n==0:examples.append({'carrier':bins.tolist(),'pigment':pb.tolist(),'depth':depth.tolist()})
bins=np.array([1,1,1,1,1]);example={'P5B4':allocate(4,bins).tolist(),'depth4':allocate(4,allocate(4,bins)).tolist()}
# periodic1D all carrier/pigment/depth obey exact integers. Quarter room integer floor.
A=np.array([0,3,5,17,93,153,204,120,49,12,1,0]*4);B=A*4//5;D=B*3//4;initial=[int(v.sum()) for v in [A,B,D]]
for step in range(100):
 outs=[]
 for j in range(len(A)):
  flux=min(int(np.floor(A[j]*.6)),int((255-A[(j+1)%len(A)])//4));ab=np.array([flux,0,0,0,A[j]-flux]);bb=allocate(int(B[j]),ab);dd=allocate(int(D[j]),bb);outs.append((ab,bb,dd))
 A,B,D=[np.array([outs[j][k][4]+outs[(j-1)%len(A)][k][0] for j in range(len(A))]) for k in range(3)]
 assert np.all((0<=D)&(D<=B)&(B<=A)&(A<=255));assert [int(v.sum()) for v in [A,B,D]]==initial
print(json.dumps({'randomDonors':100000,'coneAndIntegerSumPASS':True,'lockedMovingCarrierCount':locked,'counterexampleRepaired':example,'periodic100StepsExactTotals':initial,'remainingMovingCarrierPotentialCodes':int(np.floor(A*.6).sum()),'note':'Directed carrier fractions include quarter integer room. Deterministic ties choose outgoing0..3 then stay4; order bias explicit.'},indent=2))
