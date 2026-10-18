"""Coverage plan and source-backed grid annotations; never runs a renderer/device."""
import copy
import json
from review_catalog import catalog_variants


def _positive(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def annotate_resolution(data):
    """Report saved calculation grids, not guessed PNG pixelation or art quality."""
    for scene in data['scenes']:
        for variant in scene['variants']:
            evidence = variant.get('evidence') or {}
            metadata = evidence.get('metadata') or {}
            resolution, provenance = {}, {}
            if _positive(metadata.get('grid')):
                resolution['transportGrid'] = metadata['grid']
                provenance['transportGrid'] = 'evidence.metadata.grid'
            if _positive(metadata.get('coarseResolution')):
                resolution['transportGrid'] = metadata['coarseResolution']
                provenance['transportGrid'] = 'evidence.metadata.coarseResolution'
            if _positive(metadata.get('resolution')):
                resolution['recordedResolution'] = metadata['resolution']
                provenance['recordedResolution'] = 'evidence.metadata.resolution (meaning depends on implementation)'
            algorithm = evidence.get('algorithm') or (variant.get('earlierSource') or {}).get('algorithm')
            if algorithm in ('alternative-stable-fluids', 'alternative-artistic-front', 'search-artistic-program',
                             'alternative-correlated-paper-deposition', 'alternative-paper-deposition') and _positive(metadata.get('resolution')):
                resolution['transportGrid'] = metadata['resolution']
                provenance['transportGrid'] = 'actual metadata.resolution; corresponding alternatives source allocates transport targets at that resolution'
            if algorithm in ('alternative-finite-volume-exchange', 'macro2-dense-wetpath-exchange'):
                resolution['transportGrid'] = 256
                provenance['transportGrid'] = 'alternatives/finite-volume.ts or macro2-dense.ts: fixed gpu.target(256) coarse targets; metadata.resolution is fine/output size, config.coarse is stride, NOT grid size'
            captured = evidence.get('captureManifest') or {}
            recorded_size = metadata.get('size') or captured.get('source', {}).get('size') or captured.get('size')
            if _positive(recorded_size):
                resolution['outputSize'] = recorded_size
                provenance['outputSize'] = 'metadata.size or captureManifest recorded size'
            if (metadata.get('fineModel') or algorithm == 'wgsl-macro-implicit-fine-paper') and _positive(recorded_size) and isinstance(metadata.get('fineSteps'), int):
                resolution['localFineGrid'] = recorded_size
                resolution['fineSteps'] = metadata['fineSteps']
                provenance['localFineGrid'] = 'actual metadata.fineModel/fineSteps and input size; macro11-fine-paper.ts allocates N=size*size and dispatches full fine grid'
            reconstruction = metadata.get('fineInitialization') or metadata.get('reconstruction')
            if isinstance(reconstruction, str):
                resolution['reconstruction'] = reconstruction
            if resolution:
                resolution['transportUnknown'] = 'transportGrid' not in resolution
                resolution['outputUnknown'] = 'outputSize' not in resolution
                resolution['provenance'] = provenance
                resolution['qualification'] = 'Transport grid, local detail grid and output size are different. A1024 fine stage does not turn coarse transport into full-resolution advection. No inference from PNG appearance.'
            else:
                resolution = {'unknown': True, 'qualification': 'Calculation grid not saved in this evidence; do not infer it from the PNG or algorithm label.'}
            variant['gridResolution'] = resolution
    return data


def coverage_plan(data, registry, validations=None, measured_programs=None, measured_source=None, measured_candidates=None):
    """Catalogue plus actually measured programs; preserve immutable input bytes."""
    working = copy.deepcopy(data)
    catalog_variants(working)
    expected = []
    known = {row['key'] for row in working['variantCatalog']}
    reports = [(measured_programs or {}, measured_source, 'search-artistic-program')]
    reports += [(item['report'], item['source'], 'wgsl-fixed-wet-b-lite-coherent') for item in measured_candidates or []]
    external_cases = []
    for report, report_source, allowed in reports:
      for index, case in enumerate(report.get('cases', [])):
        request = case['request']
        result = case.get('result') or {}
        if request.get('algorithm') != allowed or not result.get('samples'):
            continue
        key = 'model:' + json.dumps([request['algorithm'], request['config']], ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        external_cases.append({'key': key, 'source': report_source, 'caseIndex': index,
                              'fixture': result.get('fixture', request.get('fixture')), 'fixtureSHA': result.get('fixtureSHA'),
                              'encoding': result.get('encoding', request.get('encoding')), 'repeatExact': result.get('repeatExact')})
        if key in known:
            continue
        known.add(key)
        label = ('Поиск программы: ' + json.dumps(request['config'], sort_keys=True) if allowed == 'search-artistic-program'
                 else 'Неподвижная лужа: B-lite, подвижный тонкий край')
        row = {'key': key, 'label': label, 'expectedOnly': True,
               'provenance': {'source': report_source, 'caseIndex': index, 'fixture': request.get('fixture'),
                'fixtureSHA': result.get('fixtureSHA'), 'encoding': result.get('encoding', request.get('encoding')), 'repeatExact': result.get('repeatExact'),
                'qualification': 'Actually measured configuration, absent from published catalogue; no unmeasured scene output inferred.'}}
        working['variantCatalog'].append(row)
        expected.append(key)
    definitions = {row['id']: row for row in registry['definitions']}
    validations = {row['key']: row for row in validations or []}
    choices = []
    for entry in working['variantCatalog']:
        key = entry['key']
        row = copy.deepcopy(entry)
        if key == 'input' or key.startswith('input-'):
            row.update(kind='input-reference', executionRequired=False, inputContract='Show the exact immutable scene input; no solver output or invented native baseline')
        elif key in ('original', 'native-lazy', 'native-one-octave', 'native-cache'):
            row.update(kind='native-mini', executionRequired=True, inputContract='Common-optical-seed-v1 forward synthetic native construction on exact common bytes, per-input raw-plane/paper roundtrip proof required. Historical native replay is separate, not an inverse capture.', model='front8-detail-flow-v4', flags={'frontZero': True, 'frontJumpZero': True, 'frontLazy': key == 'native-lazy', 'frontOneOctave': key == 'native-one-octave', 'nativeFeatherCache': key == 'native-cache'})
        else:
            if not key.startswith('model:'):
                raise ValueError('Unknown catalogue key')
            algorithm, config = json.loads(key[6:])
            definition = definitions.get(algorithm)
            row.update(kind='worker-factory', executionRequired=True, algorithm=algorithm, config=config,
                       backend=definition['backend'] if definition else None,
                       registryAvailable=definition is not None,
                       inputContract='Identical immutable rgba/water/paper/seed bytes for every common model on this scene; preserve optical-depth encoding and fixed input-derived display scale')
            if key in validations:
                row['configContract'] = validations[key]
            if definition is None:
                row['blocked'] = 'Algorithm missing from current registry; do not silently substitute another model'
            elif row.get('configContract', {}).get('valid') is False:
                row['blocked'] = row['configContract']['error']
        choices.append(row)
    canonical = [s for s in working['scenes'] if s['id'].startswith('gallery-') or s['id'] in ('mini-wave', 'mini-two-colors')]
    other = [s for s in working['scenes'] if s not in canonical]
    matrix = []
    for scene in working['scenes']:
        available = {v['comparisonKey'] for v in scene['variants']}
        matrix.append({'scene': scene['id'], 'group': 'canonical-native' if scene in canonical else 'other-functional-family',
                       'historicalAvailableKeys': len(available),
                       'historicalMissingKeys': [row['key'] for row in choices if row['key'] not in available],
                       'requiredForNewFixedPuddleKeys': [row['key'] for row in choices if row['executionRequired']],
                       'sourceContractStatus': 'PENDING fixed-domain algorithm contract; preserve source bytes/SHA unless an explicit source correction is necessary. Historical outputs certify their original domain policy only.'})
    count = len(choices)
    execute = sum(row['executionRequired'] for row in choices)
    return {'schemaVersion': 1, 'qualification': 'CPU/source-only execution inventory, no GPU runs, no filled missing results. Counts are catalogue choices/configurations, not distinct algorithms or guaranteed successful factories.',
            'externalMeasuredCases': external_cases, 'registrySourceSHA256': registry['sourceSHA256'], 'registrySourceFiles': registry['sourceFiles'],
            'summary': {'catalogChoices': count, 'nativeChoices': sum(row['kind'] == 'native-mini' for row in choices),
                        'workerChoices': sum(row['kind'] == 'worker-factory' for row in choices),
                        'inputReferences': sum(row['kind'] == 'input-reference' for row in choices),
                        'canonicalScenes': len(canonical), 'otherScenes': len(other),
                        'canonicalSlots': len(canonical)*count, 'canonicalNewExecutions': len(canonical)*execute,
                        'allSceneSlots': len(matrix)*count, 'allNewExecutions': len(matrix)*execute,
                        'historicalActualVariants': working['variantCatalogStats']['actualVariants'],
                        'historicalMissingSlots': sum(len(r['historicalMissingKeys']) for r in matrix),
                        'additionalMeasuredProgramChoices': sum(key.startswith('model:["search-artistic-program"') for key in expected),
                        'additionalMeasuredCandidateChoices': sum(not key.startswith('model:["search-artistic-program"') for key in expected),
                        'blockedChoices': sum(bool(row.get('blocked')) for row in choices)},
            'choices': choices, 'matrix': matrix,
            'gates': ['Freeze fixed-domain algorithm contract first; historical evidence remains valid for its recorded policy',
                      'Preserve existing immutable input SHA per scene; domain policy is separate from source bytes; no output-based normalization',
                      'Unsupported/guard-failed/too-expensive choices keep explicit missing/error status; never fabricate outputs',
                      'One smoke per family before full matrix, then bounded batches by sole device operator',
                      'Preserve output/initial source hashes, repeats, coarse/fine ledgers where available, GL/device errors and full timing boundary',
                      'Capability/config inventory is not shader compile or art acceptance']}
