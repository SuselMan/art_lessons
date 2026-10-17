#!/usr/bin/env python3
"""Publish scene cards from explicit evidence rows, without inventing timing ratios."""
import argparse, hashlib, json, shutil
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('data',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
 data=json.loads(a.data.read_text());images=a.output/'images';images.mkdir(parents=True,exist_ok=True)
 assert data['scenes'], 'No scenes'
 ids=set()
 for scene in data['scenes']:
  assert scene['id'] not in ids;ids.add(scene['id'])
  assert scene['variants'],scene['id']
  for variant in scene['variants']:
   source=Path(variant.pop('imageSource'));assert source.is_file(),source
   content=source.read_bytes();sha=hashlib.sha256(content).hexdigest();assert content[:8]==b'\x89PNG\r\n\x1a\n'
   name=sha+'.png';shutil.copy2(source,images/name);variant['image']='images/'+name;variant['imageSHA256']=sha
   if variant.get('comparable'):
    assert variant.get('sameInputVerified') is True, 'Comparable ratio needs actual input verification'
    assert variant.get('timeMs',0)>0 and variant.get('baselineMs',0)>0
 template=Path(__file__).with_name('compare.html').read_text();marker='/*DATA*/{"scenes":[]}'
 assert template.count(marker)==1
 (a.output/'index.html').write_text(template.replace(marker,json.dumps(data,ensure_ascii=False).replace('<','\\u003c')))
 (a.output/'comparison.json').write_text(json.dumps(data,ensure_ascii=False,indent=2))
 print(json.dumps({'scenes':len(data['scenes']),'variants':sum(len(s['variants']) for s in data['scenes'])}))
if __name__=='__main__':main()
