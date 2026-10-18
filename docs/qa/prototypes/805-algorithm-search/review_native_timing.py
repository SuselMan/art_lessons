"""Attach independently measured native timing only to matching certified material.

Proof-loop duration is never a fallback. Different native/worker preparation scopes
are deliberately not used for a cross-backend speedup.
"""
import copy
import hashlib
import json
import math
import statistics

CONTRACT = 'native-preloaded-source-to-common-cpu-material-v2'
BOUNDARY = 'preloaded original CPU planes and allocated merge resources → partition/materialize/fork upload/core/merge/dependent1px ready common-C texture'
FULL_BOUNDARY = 'preloaded original CPU planes and allocated merge resources → partition/materialize/fork upload/core/GPUmerge/full1024RGBA CPU readback; hash excluded; PRIMARY'
EXCLUDED = 'source7 acquisition/proof, merge static allocation/initial preflight, full output read/hash, final merge destruction'


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def validate_native_timing(report, cell, inp, choice, allowed_builds):
    require(report.get('pass') is True and report.get('repeatExact') is True
            and report.get('sourceStable') is True and report.get('contextClosed') is True
            and report.get('errors') == [], 'native timed report is not closed successful evidence')
    require(report.get('contract') == CONTRACT, 'native timing must certify full CPU output, not one dry tile')
    arm = 'original' if choice['key'] == 'original' else choice['key'].removeprefix('native-')
    require(report.get('request') == {'fixture': inp['id'], 'arm': arm}, 'native timed scene/arm mismatch')
    require(report.get('inputSHA') == inp['sha'] and report.get('encoding') == inp['encoding']
            and report.get('displayScale') == inp['expectedDisplayDensityScale'], 'native timed immutable input mismatch')
    require(digest(inp.get('expectedInputBinarySHA256')) and report.get('inputBinarySHA') == inp['expectedInputBinarySHA256'],
            'native timed binary input not bound to frozen catalogue')
    require(report.get('proofCommonSHA') == report.get('commonCarrierSHA') == cell['rawSHA']
            and digest(report.get('proofReportSHA')), 'timed output does not match functional common carrier')
    matches = [b for b in allowed_builds if b.get('key') == choice['key']
               and b.get('buildManifestSHA256') == report.get('buildManifestSHA')
               and b.get('sourceHashes') == report.get('sourceHashes')]
    require(len(matches) == 1 and matches[0].get('timingContract') == CONTRACT,
            'native timed source/build/scope not explicitly allowed')
    require(report.get('buildFlags', {}).get('nativeCapture') is True
            and report.get('buildFlags', {}).get('gatherSpecialization') is False, 'unexpected timed capture/gather flags')
    require(all(report.get('buildFlags', {}).get(k) == value and matches[0].get('flags', {}).get(k) == value
                for k, value in choice['flags'].items()), 'native timed transform flags mismatch')
    regime = report.get('regime', {})
    require(regime.get('repeats') == 3 and regime.get('idleRequestedMs') == 0
            and regime.get('order') == 'consecutive same owned engine; first sample retained; warm samples index1..2',
            'unsupported native timed sample regime')
    samples, hashes = report.get('samples', []), report.get('hashes', [])
    require(len(samples) == len(hashes) == 3 and report.get('outputRows') == 'gl-bottom-up'
            and digest(report.get('expectedGLSHA')) and all(h == report['expectedGLSHA'] for h in hashes),
            'three actual native timed hashes/samples required')
    for sample in samples:
        require(positive(sample.get('totalReadyMs')) and all(isinstance(sample.get(k), (int, float))
                and not isinstance(sample[k], bool) and math.isfinite(sample[k]) and sample[k] >= 0
                for k in ('setupReadyMs', 'computeReadyMs')), 'invalid native timing duration')
        require(positive(sample.get('totalToFullReadbackMs')) and isinstance(sample.get('fullReadbackMs'), (int, float))
                and not isinstance(sample['fullReadbackMs'], bool) and math.isfinite(sample['fullReadbackMs'])
                and sample['fullReadbackMs'] >= 0 and sample['totalToFullReadbackMs'] >= sample['totalReadyMs']
                and sample.get('fullOutputBoundary') == FULL_BOUNDARY, 'full material CPU readback timing absent')
        require(sample.get('primaryBoundary') == BOUNDARY and sample.get('excluded') == EXCLUDED,
                'native timer boundary changed; no implicit comparison')
    isolation = cell['nativeProof']['componentIsolation']
    evidence = report.get('lastEvidence', {})
    require(evidence.get('sourceSHA') == evidence.get('sourceSHAAfter') == isolation['originalPlaneSHA'],
            'native timed source seven planes differ')
    require(len(evidence.get('components', [])) == isolation['totalComponentCount']
            and all(s.get('componentCount') == isolation['totalComponentCount'] for s in samples),
            'native timed component dispatch count differs')
    require(report.get('mapping', {}).get('mode') == ('authored' if cell['nativeProof']['contract'] == 'authored-native-replay-v1' else 'forward'),
            'native timed encoding mapping changed')
    scope = {'contract': CONTRACT, 'boundary': FULL_BOUNDARY,
             'primaryExcluded': 'source7 proof, static setup, hash, final destruction', 'secondaryExcluded': EXCLUDED,
             'idleRequestedMs': 0, 'order': regime['order'], 'encoding': inp['encoding']}
    return {'contract': CONTRACT, 'timeMs': statistics.median(s['totalToFullReadbackMs'] for s in samples[1:]),
            'scopeKey': hashlib.sha256(json.dumps(scope, sort_keys=True).encode()).hexdigest(),
            'samples': copy.deepcopy(samples), 'sourceHashes': copy.deepcopy(report['sourceHashes']),
            'buildManifestSHA256': report['buildManifestSHA'], 'proofReportSHA256': report['proofReportSHA'],
            'commonCarrierSHA': cell['rawSHA'], 'inputSHA': copy.deepcopy(inp['sha']),
            'regime': copy.deepcopy(regime), 'crossWorkerComparable': False,
            'qualification': 'Отдельный последовательный замер исходного расчёта: разбиение, загрузка материала, расчёт, объединение и полное чтение результата в CPU. Исходные CPU-плоскости и бумага уже подготовлены. Проверочные чтения исходных плоскостей, статическое выделение ресурсов объединения и хеширование вне интервала. Полное чтение результата включено. Это не чистое GPU-время и не задержка пера; с worker-временем напрямую не сравнивается.'}


def apply_native_timings(data, cells, manifest, plan, reports, allowed_builds):
    """Return a copy. Unknown, duplicate or failing supplied sidecars fail closed."""
    out = copy.deepcopy(data)
    inputs = {i['id']: i for i in manifest['inputs']}
    choices = {c['key']: c for c in plan['choices']}
    cell_map = {(c['sceneId'], c['comparisonKey']): c for c in cells}
    verified = {}
    for report in reports:
        request = report.get('request', {})
        key = 'original' if request.get('arm') == 'original' else 'native-' + str(request.get('arm'))
        pair = (request.get('fixture'), key)
        require(pair not in verified and pair in cell_map and pair[0] in inputs
                and choices.get(key, {}).get('kind') == 'native-mini', 'unknown/duplicate native timing cell')
        verified[pair] = validate_native_timing(report, cell_map[pair], inputs[pair[0]], choices[key], allowed_builds)
    for scene in out['scenes']:
        baseline = verified.get((scene['id'], 'original'))
        for variant in scene['variants']:
            timing = verified.get((scene['id'], variant['comparisonKey']))
            if timing is None:
                continue
            variant.update(timeMs=timing['timeMs'], timingMode='в серии', comparable=False,
                           nativeTimed=copy.deepcopy(timing), resultText='Отдельный замер расчёта; с другими семействами несопоставим')
            variant.setdefault('evidence', {})['timingContract'] = CONTRACT
            variant['evidence']['nativeTimed'] = copy.deepcopy(timing)
            if baseline and timing['scopeKey'] == baseline['scopeKey'] and variant['comparisonKey'] != 'original':
                change = (timing['timeMs'] / baseline['timeMs'] - 1) * 100
                variant['nativeTimed'].update(baselineMs=baseline['timeMs'], changePercent=change,
                                             comparison='same-input-native-timed-scope-v1',
                                             outputMatchesOriginal=timing['commonCarrierSHA'] == baseline['commonCarrierSHA'])
            variant['note'] = timing['qualification']
    return out


def read_timing_bundle(report_directory, build_directories, plan):
    """Only explicit approved build directories and this queue's closed reports.

    Failed/unclosed timing arms remain missing; no diagnostic-time fallback. A
    purported successful sidecar with an invalid binding is rejected by apply().
    """
    from pathlib import Path
    from review_ingest_fixed import verify_build
    choices = {c['key']: c for c in plan['choices'] if c['kind'] == 'native-mini'}
    allowed = []
    for key, directory in build_directories.items():
        require(key in choices, 'unknown approved native timing arm')
        build = verify_build(directory)
        manifest = json.loads((Path(directory) / 'manifest.json').read_text())
        flags = {k: manifest.get(k) for k in choices[key]['flags']}
        require(flags == choices[key]['flags'] and manifest.get('nativeCapture') is True
                and manifest.get('gatherSpecialization') is False, 'timed build has unexpected model flags')
        allowed.append(dict(key=key, buildManifestSHA256=build['buildManifestSHA256'],
                            sourceHashes=build['sourceHashes'], flags=flags, timingContract=CONTRACT))
    reports, status = [], {'pendingOrFailed': [], 'reports': []}
    for file in sorted(Path(report_directory).glob('*/report.json')):
        raw = file.read_bytes()
        try:
            report = json.loads(raw)
        except json.JSONDecodeError:
            status['pendingOrFailed'].append({'updatingReport': True})
            continue
        if report.get('contextClosed') is not True or report.get('pass') is not True:
            status['pendingOrFailed'].append({'request': report.get('request'), 'closed': report.get('contextClosed'),
                                             'pass': report.get('pass')})
            continue
        require(report.get('contract') == CONTRACT, 'closed timing arm still uses diagnostic one-pixel boundary')
        reports.append(report)
        status['reports'].append({'request': report['request'], 'reportSHA256': hashlib.sha256(raw).hexdigest()})
    return reports, allowed, status
