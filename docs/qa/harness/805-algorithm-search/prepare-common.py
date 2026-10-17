#!/usr/bin/env python3
"""Prepare an explicit bounded common-model batch from verified current native sources."""
import argparse,hashlib,json
from pathlib import Path
CONFIGS=[
 ('alternative-finite-volume-exchange',dict(steps=6,mobile=.8,share=.75,adsorption=.08,coarse=2,paperGain=.25,fineSmooth=2)),
 ('alternative-correlated-paper-deposition',dict(steps=5,mobile=.8,share=.7,adsorption=.09,paperBias=1,coarse=8,paperScale=8,micro=.1,relief=4.5)),
 ('alternative-stable-fluids',dict(resolution=256,steps=4,projection=4,force=2)),
 ('alternative-artistic-front',dict(resolution=256,steps=8,budget=16,rim=.35)),
 ('wgsl-d2q9-bgk',dict(grid=256,steps=16,diffusion=.015)),
]
def main():
 p=argparse.ArgumentParser();p.add_argument('native',type=Path);p.add_argument('output',type=Path);a=p.parse_args();a.output.mkdir(exist_ok=True)
 report=json.loads(a.native.read_text());assert report['pass'];catalog=[];cases=[]
 for row in report['cases']:
  assert row['pass'];v=next(v for v in row['variants'] if v['id']=='original');assert v['captureMetadata']['nativeMaterialModel']=='front8-detail-flow-v4'
  if not row.get('commonAvailable'):continue
  capture=row['capture'];binary=Path(capture['file']);metadata=Path(capture['manifestFile']);assert binary.stat().st_size==6*1024*1024;assert hashlib.sha256(binary.read_bytes()).hexdigest()==capture['binarySHA']
  catalog.append(dict(id=row['id'],label=row['title'],input=str(binary),metadata=str(metadata)))
  cases.extend(dict(algorithm=algorithm,fixture=row['id'],encoding='optical-density',config=config,repeats=3) for algorithm,config in CONFIGS)
 (a.output/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2));(a.output/'cases.json').write_text(json.dumps(cases,indent=2));print('fixtures',len(catalog),'cases',len(cases))
if __name__=='__main__':main()
