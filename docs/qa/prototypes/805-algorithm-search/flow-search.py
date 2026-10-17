#!/usr/bin/env python3
"""Bounded measured configuration screening, NOT formal superoptimization.
No universal aesthetic score: reject mechanical errors, list tradeoffs for review.
"""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('reports',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);a=p.parse_args()
rows=[]
for file in a.reports:
 for c in json.loads(file.read_text())['cases']:
  if not c.get('pass'):continue
  r=c['result'];f=r.get('flowMetrics') or c.get('flow');q=c['request']
  if not f:continue
  mass=r['metrics'].get('massRatio');mechanical=bool(r['repeatExact'] and r['metrics']['invalidPremul']==0 and f['changedDryPixels']==0)
  if q['fixture'] in ['flow-dry-barrier','flow-one-pixel-wall','flow-isolated-pools']:mechanical &= f['blueCrossFraction']==0 and f['yellowCrossFraction']==0
  if q['fixture']=='flow-water-only':mechanical &= f['alphaCarrier']==0
  if q['fixture']=='flow-dry-pigment':mechanical &= r['metrics']['changedPixels']==0
  rows.append({'fixture':q['fixture'],'algorithm':q['algorithm'],'config':q.get('config',{}),'mechanicalPass':mechanical,'massRatio':mass,'readyMs':r.get('warmMedianMs'),'beyond50':f['massBeyond50px'],'mixing':f['mixedCarrierFraction'],'artisticAcceptance':'requires image review','sourceReport':str(file)})
result={'scope':'Bounded measured screening; functional and visual tradeoffs remain separate; no proof of optimality or physical correctness','cases':rows,'mechanicalFailures':[r for r in rows if not r['mechanicalPass']]}
a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'cases':len(rows),'mechanicalFailures':len(result['mechanicalFailures'])}))
