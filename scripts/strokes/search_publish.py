"""Publish an immutable human-review batch into the existing private gallery.

Usage: search_publish.py <round artifacts> <gallery BASE>
Images are diagnostics, not publication of Grafetto code.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil

import numpy as np
from PIL import Image
from carrier_replay import ROOT


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('artifacts', type=Path)
    ap.add_argument('gallery', type=Path)
    args = ap.parse_args()
    data = args.gallery/'data'
    with (data/'review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = data/'review-batches.json'
        batches = json.loads(path.read_text()) if path.exists() else []
        if any(b['id']=='round1' for b in batches):
            raise ValueError('Batch already exists; its images and votes are immutable')
    root = args.artifacts
    inputs = json.loads((root/'inputs.json').read_text())
    variants = ['baseline', 'brush-step-short', 'landing-rich']
    reports = {v: json.loads((root/v/'report.json').read_text()) for v in variants}
    for v, report in reports.items():
        if report['errors'] or len(report['cases']) != len(inputs['cases']):
            raise ValueError('Incomplete/error render '+v)
        if any(r['lost'] or r['error'] or not r['draws'] for r in report['cases']):
            raise ValueError('GPU pass not reached '+v)
        if v != 'baseline' and report['replacements'] < 1:
            raise ValueError('Candidate patch not reached '+v)
    dest = args.gallery/'previews/search-round1'
    dest.mkdir(parents=True, exist_ok=True, mode=0o700)
    cases = []
    stats = []
    for test in inputs['cases']:
        baseline = Image.open(root/'baseline'/f'{test["id"]}.png').crop(test['box']).convert('RGB')
        baseline.save(dest/f'{test["id"]}-baseline.png')
        shutil.copyfile(ROOT/'docs/reference/strokes'/test['reference'], dest/f'{test["id"]}-photo.jpg')
        candidates = ['landing-rich'] + (['brush-step-short'] if test['sheet'] in ('6','9') else [])
        for variant in candidates:
            image = Image.open(root/variant/f'{test["id"]}.png').crop(test['box']).convert('RGB')
            difference = np.abs(np.asarray(image,dtype=int)-np.asarray(baseline,dtype=int))
            # Identical outputs cannot teach a better/worse evaluator anything.
            if not difference.max():
                continue
            name = f'{test["id"]}-{variant}.png'
            image.save(dest/name)
            prefix = 'preview/search-round1/'
            cases.append({'id':test['id']+'-'+variant, 'sheet':test['sheet'], 'n':test['n'],
                          'baseline':prefix+f'{test["id"]}-baseline.png', 'candidate':prefix+name,
                          'reference':prefix+f'{test["id"]}-photo.jpg', 'candidateId':variant,
                          'inputSha256':test['inputSha256'], 'baseEngine':inputs['base'],
                          'candidateImageSha256':hashlib.sha256((dest/name).read_bytes()).hexdigest()})
            stats.append({'id':cases[-1]['id'], 'meanDifference':float(difference.mean()),
                          'changedPixels':int((difference.max(axis=2)>1).sum())})
    batch = {'id':'round1', 'title':'Пачка 1', 'created':datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'baseEngine':inputs['base'], 'cases':cases}
    # Append under the same inter-process lock as votes; never mutate a batch
    # someone could already have ranked.
    with (data/'review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = data/'review-batches.json'
        batches = json.loads(path.read_text()) if path.exists() else []
        if any(b['id']==batch['id'] for b in batches):
            raise ValueError('Batch already exists; use a new immutable batch id')
        batches.append(batch)
        tmp = path.with_suffix('.tmp')
        tmp.write_text(json.dumps(batches, ensure_ascii=False, indent=2)+'\n')
        tmp.chmod(0o600)
        os.replace(tmp,path)
    for f in dest.iterdir():
        f.chmod(0o600)
    (root/'batch.json').write_text(json.dumps(batch,ensure_ascii=False,indent=2))
    (root/'batch-differences.json').write_text(json.dumps(stats,indent=2))
    print(json.dumps({'batch':batch['id'],'cases':len(cases),'variants':sorted(set(c['candidateId'] for c in cases))}))


if __name__ == '__main__':
    main()
