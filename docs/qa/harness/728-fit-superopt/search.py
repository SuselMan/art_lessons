#!/usr/bin/env python3
"""Bounded enumerative superoptimization, NOT a handwritten rewrite.
Grammar: binary max trees using each of five finite nonnegative f32 leaves once.
Leaf arithmetic and final division remain fixed. On this domain IEEE unsigned
bit order equals numeric order; max selects an original unchanged f32 bit pattern.
The final constant 1 excludes signed-zero tie differences from the denominator.
"""
import json,itertools,time,sys
from functools import lru_cache
from pathlib import Path
import z3
LEAVES=('one','r','g','b','a')
@lru_cache(None)
def trees(leaves):
 if len(leaves)==1:return (leaves[0],)
 result=[];first=leaves[0]
 for size in range(1,len(leaves)):
  for part in itertools.combinations(leaves[1:],size-1):
   left=(first,)+part;right=tuple(x for x in leaves if x not in left)
   result.extend(('max',a,b) for a in trees(left) for b in trees(right))
 return tuple(result)
def depth(t):return 0 if isinstance(t,str) else 1+max(depth(t[1]),depth(t[2]))
def emit(t):return ('1.0' if t=='one' else 'v.'+t) if isinstance(t,str) else 'max('+emit(t[1])+','+emit(t[2])+')'
def evaluate(t,leaves):
 if isinstance(t,str):return leaves[t]
 a,b=evaluate(t[1],leaves),evaluate(t[2],leaves)
 return z3.If(z3.UGE(a,b),a,b)
def main():
 baseline=('max','one',('max',('max','r','g'),('max','b','a')))
 variables={k:z3.BitVec(k,32) for k in LEAVES if k!='one'};variables['one']=z3.BitVecVal(0x3f800000,32)
 domain=[z3.ULE(v,0x7f7fffff) for k,v in variables.items() if k!='one']
 start=time.monotonic();rows=[]
 for t in trees(LEAVES):
  solver=z3.Solver();solver.set(timeout=5000);solver.add(*domain,evaluate(t,variables)!=evaluate(baseline,variables));check=solver.check()
  rows.append({'expression':emit(t),'maxOps':4,'depth':depth(t),'equivalence':str(check)})
 # Independent literal FP32 checks for baseline plus best-depth and chain forms.
 fpvars={k:z3.fpBVToFP(v,z3.Float32()) for k,v in variables.items()}
 def fp_eval(t):return fpvars[t] if isinstance(t,str) else z3.fpMax(fp_eval(t[1]),fp_eval(t[2]))
 fpchecks=[]
 for t in (baseline,('max','one',('max',('max','r','b'),('max','g','a'))),('max','one',('max','r',('max','g',('max','b','a'))))):
  proof=z3.Solver();proof.set(timeout=10000);proof.add(*domain,z3.fpToIEEEBV(fp_eval(t))!=z3.fpToIEEEBV(fp_eval(baseline)));fpchecks.append({'expression':emit(t),'check':str(proof.check())})
 bestDepth=min(r['depth'] for r in rows if r['equivalence']=='unsat')
 candidates=[r for r in rows if r['depth']==bestDepth and r['equivalence']=='unsat']
 result={'solver':z3.get_version_string(),'literalFp32Checks':fpchecks,'grammar':'binary max trees, each of 5 leaves exactly once, commutative partitions canonicalized','domain':'nonnegative finite f32 bit patterns 0..0x7f7fffff; unchanged constant1+channel leaf arithmetic+finaldivision','baseline':{'expression':emit(baseline),'maxOps':4,'depth':depth(baseline)},'enumerated':len(rows),'proved':sum(r['equivalence']=='unsat' for r in rows),'unknown':sum(r['equivalence']=='unknown' for r in rows),'counterexamples':sum(r['equivalence']=='sat' for r in rows),'bestMaxOps':4,'bestDepth':bestDepth,'paretoCandidates':candidates,'searchSeconds':time.monotonic()-start,'rows':rows,'limitation':'Bounded grammar optimum only; no reassociation/division reciprocal/NaN-domain proof or GPU speed claim'}
 out=Path(sys.argv[1] if len(sys.argv)>1 else 'search-result.json');out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ('enumerated','proved','unknown','counterexamples','bestMaxOps','bestDepth','searchSeconds')}))
if __name__=='__main__':main()
