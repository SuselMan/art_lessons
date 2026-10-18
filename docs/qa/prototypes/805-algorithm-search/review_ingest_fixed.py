"""CPU-only ingestion of explicitly named fixed worker report directories.

No historical discovery, devices, services or publication. Immutable build files,
PNG/gzip bytes, source/input/raw audit and renderer binding are checked per row.
Failed rows remain in the coverage report; exact successful-row closure is explicit.
"""
import argparse
import copy
import zlib
import hashlib
import json
from pathlib import Path
from review_fixed_matrix import (MatrixError, require, catalog_identity_sha,
                                 worker_cell_from_batch, coverage_report)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(file):
    return json.loads(Path(file).read_text())


def verify_build(directory):
    directory = Path(directory)
    raw = (directory / 'manifest.json').read_bytes()
    source = {}
    for row in json.loads(raw)['files']:
        name = row['file']
        require(not Path(name).is_absolute() and '..' not in Path(name).parts and name not in source,
                'unsafe/duplicate immutable build file')
        value = sha((directory / name).read_bytes())
        require(value == row['sha256'], 'immutable build file SHA mismatch: ' + name)
        source[name] = value
    require(all(k in source for k in ('index.html', 'entry.js', 'worker.js')), 'incomplete worker build')
    return {'buildManifestSHA256': sha(raw), 'sourceHashes': source}


def merge_ledgers(plan, files):
    identity = catalog_identity_sha(plan)
    known = {c['key'] for c in plan['choices']}
    merged = {}
    for file in files:
        ledger = load(file)
        require(ledger['catalogSHA256'] == identity, 'ledger catalogue identity mismatch')
        seen = set()
        for row in ledger['choices']:
            key = row['key']
            require(key in known and key not in seen, 'unknown/duplicate ledger key')
            seen.add(key)
            for build in row['builds']:
                if build not in merged.setdefault(key, []):
                    merged[key].append(build)
    return {'catalogSHA256': identity, 'choices': [{'key': k, 'builds': v} for k, v in merged.items()]}


def enrich_manifest(manifest, catalog, ledger):
    manifest = copy.deepcopy(manifest)
    require(len(catalog) == len(manifest['inputs']) and {r['id'] for r in catalog} == {r['id'] for r in manifest['inputs']},
            'frozen input catalogue mismatch')
    for inp in manifest['inputs']:
        record = next(r for r in catalog if r['id'] == inp['id'])
        require(record['sha'] == inp['sha'] and record['encoding'] == inp['encoding'], 'catalogue input SHA/encoding mismatch')
        raw = Path(record['metadata']).read_bytes()
        require(sha(raw) == record['metadataSHA256'], 'capture metadata SHA mismatch')
        meta = json.loads(raw)
        if 'manifest' in meta:
            require(meta['manifest']['commonSHA'] == inp['sha'], 'capture common SHA mismatch')
            scale = meta['manifest']['pigmentScale']
        else:
            require(meta.get('source', {}).get('kind') == 'deterministic-fixture' and meta.get('sha') == inp['sha'],
                    'unknown source scale')
            scale = 1
        require(isinstance(scale, (int, float)) and 0 < scale <= 1, 'invalid source scale')
        inp['expectedDisplayDensityScale'] = scale
    manifest['allowedBuilds'] = {r['key']: r['builds'] for r in ledger['choices']}
    return manifest


def normalize_reports(plan, manifest, reports, builds, output_dir):
    """reports are explicit paths; builds are already independently verified snapshots."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    inputs = {i['id']: i for i in manifest['inputs']}
    canonical = lambda a, c: json.dumps([a, c], sort_keys=True, separators=(',', ':'))
    choices = {canonical(c['algorithm'], c['config']): c for c in plan['choices'] if c['kind'] == 'worker-factory'}
    cells, failures, rejected, duplicates, accepted = [], [], [], [], {}
    for report_path in reports:
        report_path = Path(report_path)
        try:
            report_raw = report_path.read_bytes()
            report = json.loads(report_raw)
            matching = [b for b in builds if b['sourceHashes'] == report.get('sourceHashes')]
            require(len(matching) == 1, 'report does not match one explicitly verified immutable build')
            build = matching[0]
            require(report.get('contextClosed') is True and report.get('errors') == [],
                    'report context not closed or contains browser errors')
            excluded = [i for i, r in enumerate(report['cases']) if r.get('pass') is not True]
            closure = dict(reportSHA256=sha(report_raw), buildManifestSHA256=build['buildManifestSHA256'],
                           sourceHashesBefore=report['sourceHashes'], sourceHashesAfter=build['sourceHashes'],
                           verifiedReadBuild=True, sourceStable=True, contextClosed=True, errors=[],
                           excludedFailedRows=excluded,
                           qualification='Independent immutable build read; only successful exact rows, original report status preserved.')
            closure_path = output_dir / ('closure-' + sha(report_raw) + '.json')
            closure_path.write_text(json.dumps(closure, indent=2) + '\n')
            closure_sha = sha(closure_path.read_bytes())
        except (MatrixError, KeyError, OSError, ValueError) as error:
            rejected.append({'reportSHA256': sha(report_path.read_bytes()) if report_path.exists() else None,
                             'error': str(error)})
            continue
        for index, row in enumerate(report['cases']):
            if index in excluded:
                failures.append({'reportSHA256': sha(report_raw), 'rowIndex': index,
                                 'algorithm': row.get('request', {}).get('algorithm'),
                                 'fixture': row.get('request', {}).get('fixture'), 'status': 'original-row-not-PASS'})
                continue
            try:
                result, request = row['result'], row['request']
                choice = choices[canonical(result['algorithm'], result['config'])]
                inp = inputs[result['fixture']]
                require(row.get('captureInputExact') is True and row.get('sameFixtureInput') is True,
                        'actual immutable input capture proof absent')
                renderer = copy.deepcopy(row['commonRenderer'])
                require(renderer.get('paperSource') == result.get('display', {}).get('paperSource') == 'exact-input-paper'
                        and renderer['inputSHA'] == result['fixtureSHA'] == request['expectedInputSHA'] == inp['sha'],
                        'paper identity cannot be derived without exact input/source proof')
                renderer['paperSHA'] = inp['sha']['paper']
                image = report_path.parent / row['png']['file']
                require(sha(image.read_bytes()) == row['png']['sha256'], 'PNG bytes mismatch')
                carrier = row['carrier']
                compressed = (report_path.parent / carrier['file']).read_bytes()
                require(sha(compressed) == carrier['gzipSHA256'], 'carrier gzip SHA mismatch')
                decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
                decoded = decoder.decompress(compressed, inp['size'] ** 2 * 4 + 1)
                require(decoder.eof and not decoder.unconsumed_tail and not decoder.unused_data,
                        'carrier gzip exceeds bounded single-frame output')
                require(len(decoded) == carrier['decodedBytes'] == inp['size'] ** 2 * 4
                        and sha(decoded) == carrier['decodedSHA256'], 'decoded carrier SHA/size mismatch')
                require(row['rawAudit']['rawSHA'] == carrier['decodedSHA256']
                        and all(h == carrier['decodedSHA256'] for h in result['hashes']), 'repeat/raw carrier mismatch')
                require(row['rawAudit']['invalidPremulPixels'] == 0 and row['rawAudit']['changedDryChannels'] == 0,
                        'raw audit bounds/dry failure')
                variant = {'id': 'fixed-' + sha(choice['key'].encode())[:16], 'label': choice['label'],
                           'imageSource': str(image), 'timeMs': result.get('warmMedianMs'), 'timingMode': 'в серии',
                           'evidence': {'samples': result['samples'], 'repeatExact': result['repeatExact'],
                                        'actualReportSHA256': sha(report_raw)}}
                cell = worker_cell_from_batch(report, row, scene_id=inp['id'], comparison_key=choice['key'],
                    variant=variant, raw_audit=row['rawAudit'], common_renderer=renderer,
                    build_manifest_sha=build['buildManifestSHA256'], closure=closure,
                    report_sha=sha(report_raw), closure_sha=closure_sha, row_index=index)
                tiny_plan = {'choices': [choice], 'matrix': [{'scene': inp['id']}],
                             'registrySourceSHA256': manifest['registrySHA']}
                tiny_manifest = {**manifest, 'inputs': [inp], 'choices': [choice]}
                proof = coverage_report({'scenes': [{'id': inp['id']}]}, tiny_plan, tiny_manifest, [cell])
                require(proof['complete'], 'normalized row evidence rejected: ' + json.dumps(proof['invalid']))
                key = (inp['id'], choice['key'])
                if key in accepted:
                    old = accepted[key]
                    require(all(old[k] == cell[k] for k in ('buildManifestSHA256', 'rawSHA', 'pngSHA', 'sourceHashes')),
                            'conflicting duplicate matrix cell; no implicit source precedence')
                    duplicates.append({'scene': inp['id'], 'key': choice['key'], 'reportSHA256': sha(report_raw)})
                    continue
                accepted[key] = cell
                cells.append(cell)
            except (MatrixError, KeyError, OSError, ValueError, zlib.error) as error:
                rejected.append({'reportSHA256': sha(report_raw), 'rowIndex': index,
                                 'algorithm': row.get('request', {}).get('algorithm'),
                                 'fixture': row.get('request', {}).get('fixture'), 'error': str(error)})
    return cells, {'failedOriginalRows': failures, 'rejectedRowsOrReports': rejected, 'identicalDeduplicatedRows': duplicates}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('plan', 'manifest', 'input-catalog', 'references', 'output-dir'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--allowed-builds', nargs='+', type=Path, required=True)
    parser.add_argument('--build-dir', action='append', type=Path, required=True)
    parser.add_argument('--report-dir', action='append', type=Path, required=True)
    args = parser.parse_args(argv)
    plan = load(args.plan)
    ledger = merge_ledgers(plan, args.allowed_builds)
    manifest = enrich_manifest(load(args.manifest), load(args.input_catalog), ledger)
    builds = [verify_build(p) for p in args.build_dir]
    require(len({b['buildManifestSHA256'] for b in builds}) == len(builds), 'duplicate build directory')
    reports = sorted({p for d in args.report_dir for p in ([d / 'report.json'] if (d / 'report.json').exists() else d.glob('batch-*/report.json'))})
    require(bool(reports), 'no explicitly named worker report files')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    cells, diagnostics = normalize_reports(plan, manifest, reports, builds, args.output_dir)
    references = load(args.references)
    require(isinstance(references, list) and len(references) == len(manifest['inputs'])
            and {r['sceneId'] for r in references} == {i['id'] for i in manifest['inputs']}, 'exact reference scene set required')
    shell = {'scenes': [{'id': i['id']} for i in manifest['inputs']]}
    coverage = coverage_report(shell, plan, manifest, cells + references)
    coverage['ingestion'] = diagnostics
    coverage['qualification'] += ' Failed original rows retained; identical same-build outputs alone can deduplicate.'
    (args.output_dir / 'worker-cells.json').write_text(json.dumps(cells, ensure_ascii=False, indent=2) + '\n')
    (args.output_dir / 'merged-allowed-builds.json').write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
    (args.output_dir / 'coverage.json').write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: coverage[k] for k in ('complete', 'requiredCells', 'providedCells', 'validUniqueCells')}))
    print(json.dumps({k: len(v) for k, v in diagnostics.items()}))
    return 0  # Artifact produced; complete remains the explicit final-publication gate.


if __name__ == '__main__':
    raise SystemExit(main())
