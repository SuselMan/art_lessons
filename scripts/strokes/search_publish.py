"""Publish an immutable human-review batch into the existing private gallery.

Usage: search_publish.py <artifacts> <gallery BASE> [--batch-id round2 --title ...]
Optional --config JSON: {baseline: "baseline", comparisons: [{case, candidate,
baseline?}]}. Without config retain the historical round1 selection.
Images are diagnostics, not publication of Grafetto code.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

import numpy as np
from PIL import Image
from carrier_replay import ROOT


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value):
        raise ValueError('Invalid identifier')
    return value


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    os.replace(temporary, path)


def publish(root, gallery, batch_id='round1', title='Пачка 1', config=None):
    identifier(batch_id)
    if not isinstance(title, str) or not title.strip() or len(title) > 200:
        raise ValueError('Invalid title')
    inputs = json.loads((root/'inputs.json').read_text())
    tests = {identifier(test['id']): test for test in inputs['cases']}
    if len(tests) != len(inputs['cases']):
        raise ValueError('Duplicate input cases')
    if config is None:
        comparisons = [{'case': test['id'], 'candidate': variant} for test in inputs['cases']
                       for variant in (['landing-rich'] + (['brush-step-short'] if test['sheet'] in ('6','9') else []))]
        default_baseline = 'baseline'
    else:
        default_baseline = identifier(config.get('baseline', 'baseline'))
        comparisons = config['comparisons']
    selected = []
    seen = set()
    for comparison in comparisons:
        case = identifier(comparison['case'])
        candidate = identifier(comparison['candidate'])
        baseline = identifier(comparison.get('baseline', default_baseline))
        identity = case+'-'+candidate
        if case not in tests or identity in seen or baseline == candidate:
            raise ValueError('Unknown, duplicate, or identical comparison')
        seen.add(identity)
        selected.append((tests[case], baseline, candidate))
    if not selected:
        raise ValueError('Empty selection')
    variants = {variant for _, baseline, candidate in selected for variant in (baseline, candidate)}
    reports = {variant: json.loads((root/variant/'report.json').read_text()) for variant in variants}
    for variant, report in reports.items():
        if report['errors'] or report.get('complete', True) is not True:
            raise ValueError('Incomplete/error render '+variant)
        if report.get('base') != inputs['base'] or report.get('variant') != variant:
            raise ValueError('Render identity mismatch '+variant)
        rows = {row['id']: row for row in report['cases']}
        for test, baseline, candidate in selected:
            if variant not in (baseline, candidate):
                continue
            row = rows.get(test['id'])
            if not row or row['lost'] or row['error'] or not row['draws'] or row.get('variant') != variant:
                raise ValueError('GPU pass not reached '+variant+' '+test['id'])
            image_path = root/variant/(test['id']+'.png')
            digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
            if row.get('pngSha256') != digest:
                raise ValueError('Render image checksum mismatch '+variant+' '+test['id'])
            if variant != 'baseline' and report.get('replacements', 0) < 1 and row.get('shaderReplacements', 0) < 1:
                raise ValueError('Candidate patch not reached '+variant+' '+test['id'])
    data = gallery/'data'
    previews = gallery/'previews'
    previews.mkdir(parents=True, exist_ok=True, mode=0o700)
    dest = previews/('search-'+batch_id)
    with (data/'review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        path = data/'review-batches.json'
        batches = json.loads(path.read_text()) if path.exists() else []
        if any(batch['id'] == batch_id for batch in batches) or dest.exists():
            raise ValueError('Batch/directory already exists; images and votes are immutable')
        stage = Path(tempfile.mkdtemp(prefix='.search-stage-', dir=previews))
        cases, stats = [], []
        try:
            prefix = 'preview/search-'+batch_id+'/'
            for test, baseline_variant, candidate in selected:
                baseline = Image.open(root/baseline_variant/(test['id']+'.png')).crop(test['box']).convert('RGB')
                image = Image.open(root/candidate/(test['id']+'.png')).crop(test['box']).convert('RGB')
                difference = np.abs(np.asarray(image, dtype=int)-np.asarray(baseline, dtype=int))
                if not difference.max():
                    continue
                identity = test['id']+'-'+candidate
                baseline_name = identity+'-baseline.png'
                candidate_name = identity+'-candidate.png'
                reference_name = test['id']+'-photo.jpg'
                baseline.save(stage/baseline_name)
                image.save(stage/candidate_name)
                reference = ROOT/'docs/reference/strokes'/test['reference']
                reference.resolve().relative_to((ROOT/'docs/reference/strokes').resolve())
                shutil.copyfile(reference, stage/reference_name)
                case = {'id': identity, 'sheet': test['sheet'], 'n': test['n'],
                        'baseline': prefix+baseline_name, 'candidate': prefix+candidate_name,
                        'reference': prefix+reference_name, 'candidateId': candidate,
                        'baselineId': baseline_variant, 'inputSha256': test['inputSha256'],
                        'baseEngine': inputs['base']}
                for key, name in [('candidateImageSha256', candidate_name), ('baselineImageSha256', baseline_name),
                                  ('referenceImageSha256', reference_name)]:
                    case[key] = hashlib.sha256((stage/name).read_bytes()).hexdigest()
                case['candidateReportSha256'] = hashlib.sha256((root/candidate/'report.json').read_bytes()).hexdigest()
                case['baselineReportSha256'] = hashlib.sha256((root/baseline_variant/'report.json').read_bytes()).hexdigest()
                candidate_report = reports[candidate]
                candidate_row = next(row for row in candidate_report['cases'] if row['id'] == test['id'])
                case['patchProof'] = {'compiledReplacements': candidate_report.get('replacements', 0),
                                      'shaderReplacements': candidate_row.get('shaderReplacements', 0)}
                cases.append(case)
                stats.append({'id': identity, 'meanDifference': float(difference.mean()),
                              'changedPixels': int((difference.max(axis=2)>1).sum())})
            if not cases:
                raise ValueError('All outputs identical; nothing to evaluate')
            batch = {'id': batch_id, 'title': title.strip(),
                     'created': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'baseEngine': inputs['base'], 'cases': cases,
                     'inputManifestSha256': hashlib.sha256((root/'inputs.json').read_bytes()).hexdigest(),
                     'selection': config}
            for file in stage.iterdir():
                file.chmod(0o600)
            os.replace(stage, dest)
            # Images are complete before any batch is visible. An interrupted append
            # leaves an orphan directory which is deliberately never overwritten.
            atomic_json(path, batches+[batch])
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    atomic_json(root/('batch-'+batch_id+'.json'), batch)
    atomic_json(root/('batch-differences-'+batch_id+'.json'), stats)
    if batch_id == 'round1':
        atomic_json(root/'batch.json', batch)
        atomic_json(root/'batch-differences.json', stats)
    return batch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('artifacts', type=Path)
    parser.add_argument('gallery', type=Path)
    parser.add_argument('--batch-id', default='round1')
    parser.add_argument('--title', default='Пачка 1')
    parser.add_argument('--config', type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text()) if args.config else None
    batch = publish(args.artifacts, args.gallery, args.batch_id, args.title, config)
    print(json.dumps({'batch': batch['id'], 'cases': len(batch['cases']),
                      'variants': sorted({case['candidateId'] for case in batch['cases']})}))


if __name__ == '__main__':
    main()
