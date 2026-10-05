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


def source_report(root, variant, case_id):
    directory = root/variant
    direct = directory/'report.json'
    index = directory/'report-index.json'
    if direct.exists() and index.exists():
        raise ValueError('Ambiguous report source '+variant)
    if direct.exists():
        path = direct
    else:
        def unique_pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    raise ValueError('Duplicate report index key '+key)
                result[key] = value
            return result
        mapping = json.loads(index.read_text(), object_pairs_hook=unique_pairs)['cases']
        if not isinstance(mapping, dict) or case_id not in mapping:
            raise ValueError('Missing report mapping '+variant+' '+case_id)
        relative = mapping[case_id]
        if not isinstance(relative, str) or Path(relative).is_absolute():
            raise ValueError('Invalid report path')
        path = directory/relative
        try:
            path.resolve().relative_to(directory.resolve())
        except ValueError:
            raise ValueError('Report path escapes variant directory') from None
    try:
        path.resolve().relative_to(directory.resolve())
    except ValueError:
        raise ValueError('Report path escapes variant directory') from None
    report = json.loads(path.read_text())
    ids = [row['id'] for row in report['cases']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate render case '+variant)
    return report, path


def publish(root, gallery, batch_id='round1', title='Пачка 1', config=None):
    identifier(batch_id)
    description = config.get('description', '') if config else ''
    if not isinstance(description, str) or len(description) > 1000:
        raise ValueError('Invalid description')
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
    reports = {(variant, test['id']): source_report(root, variant, test['id'])
               for test, baseline, candidate in selected for variant in (baseline, candidate)}
    for (variant, case_id), (report, report_path) in reports.items():
        if report['errors'] or report.get('complete', True) is not True:
            raise ValueError('Incomplete/error render '+variant)
        if report.get('base') != inputs['base'] or report.get('variant') != variant:
            raise ValueError('Render identity mismatch '+variant)
        rows = {row['id']: row for row in report['cases']}
        for test, baseline, candidate in selected:
            if variant not in (baseline, candidate) or test['id'] != case_id:
                continue
            row = rows.get(test['id'])
            zero_brush_diagnostic = (config is not None
                and config.get('allowZeroBrushDiagnostic') == {
                    'variant': 'selected-soft16-sheet7-no-contact-diagnostic', 'case': 's7-n3'}
                and variant == 'selected-soft16-sheet7-no-contact-diagnostic' and case_id == 's7-n3'
                and row is not None and row.get('draws') == 0
                and row.get('programDraws', {}).get('brush') == 0
                and row.get('programDraws', {}).get('diffuse', 0) > 0
                and row.get('programDraws', {}).get('fieldHigh', 0) > 0)
            if not row or row['lost'] or row['error'] or (not row['draws'] and not zero_brush_diagnostic) or row.get('variant') != variant:
                raise ValueError('GPU pass not reached '+variant+' '+test['id'])
            image_path = root/variant/(test['id']+'.png')
            digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
            if row.get('pngSha256') != digest:
                raise ValueError('Render image checksum mismatch '+variant+' '+test['id'])
            modules = report.get('modulePatchCounts', [])
            custom = row.get('customReplacements', [])
            if not isinstance(modules, list) or not isinstance(custom, list) or len(modules) != len(custom):
                raise ValueError('Malformed custom patch proof '+variant+' '+test['id'])
            if any(type(count) is not int or count < 0 for count in modules+custom):
                raise ValueError('Malformed custom patch counters '+variant+' '+test['id'])
            if modules and (report.get('complete') is not True or
                            any(module <= 0 and shader <= 0 for module, shader in zip(modules, custom))):
                raise ValueError('Custom patch not reached '+variant+' '+test['id'])
            if variant != 'baseline' and not modules and report.get('replacements', 0) < 1 and row.get('shaderReplacements', 0) < 1:
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
                case['candidateReportSha256'] = hashlib.sha256(reports[(candidate, test['id'])][1].read_bytes()).hexdigest()
                case['baselineReportSha256'] = hashlib.sha256(reports[(baseline_variant, test['id'])][1].read_bytes()).hexdigest()
                candidate_report = reports[(candidate, test['id'])][0]
                candidate_row = next(row for row in candidate_report['cases'] if row['id'] == test['id'])
                case['patchProof'] = {'compiledReplacements': candidate_report.get('replacements', 0),
                                      'shaderReplacements': candidate_row.get('shaderReplacements', 0),
                                      'modulePatchCounts': candidate_report.get('modulePatchCounts', []),
                                      'customReplacements': candidate_row.get('customReplacements', [])}
                cases.append(case)
                stats.append({'id': identity, 'meanDifference': float(difference.mean()),
                              'changedPixels': int((difference.max(axis=2)>1).sum())})
            if not cases:
                raise ValueError('All outputs identical; nothing to evaluate')
            batch = {'id': batch_id, 'title': title.strip(),
                     'created': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'baseEngine': inputs['base'], 'cases': cases,
                     'inputManifestSha256': hashlib.sha256((root/'inputs.json').read_bytes()).hexdigest(),
                     'selection': config, 'description': description}
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
