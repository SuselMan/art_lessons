"""Strict final fixed-policy matrix assembly. Pure CPU; never import historical images.

Cells are normalized evidence envelopes. Callers retain report/audit paths externally:
{sceneId, comparisonKey, request, result, sourceHashes, variant, pngSHA,
 rawSHA, commonRenderer:{inputSHA, inputDerivedScale, outputNormalized:false},
 nativeProof?:{contract,inputSHA,rawPlanesExact,paperExact,sourceUnchanged,
               fixedInitialWet,roundtripExact}}.
variant.imageSource points to the already rendered PNG. No rendering happens here.
"""
import copy
import hashlib
import re
from pathlib import Path
from review_coverage import annotate_resolution


class MatrixError(ValueError):
    pass


def require(ok, message):
    if not ok:
        raise MatrixError(message)


def digest(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None


def audit_actual_ledger_guards(metadata):
    """Independent strict JSON equivalent of the central QA ledger-guards contract."""
    zero = {'dryMaterial', 'invalid', 'negative', 'overflow', 'inactiveCoarseNonzero', 'coarseOverflow',
            'initCapacityFailures', 'packFailures', 'coarseOutOfRangeCells', 'coarseInvalidPremulCells',
            'coarseRepresentationOverflowCells'}
    yes = {'fixedWetConserved', 'guardPassed', 'coarsePigmentConserved', 'coarseWaterConserved',
           'coarseGuardPassed', 'prePackGuardPassed'}
    checked = []
    def visit(value, prefix):
        if not isinstance(value, dict):
            return
        for key, item in value.items():
            name = prefix + '.' + key
            if key in zero and item is not None:
                require(type(item) in (int, float) and item == 0, 'ledger counter failed: ' + name)
                checked.append(name)
            if key in yes and item is not None:
                require(item is True, 'ledger guard failed: ' + name)
                checked.append(name)
            if key in ('fixedWetDeltaRGBA', 'coarsePigmentDeltaRGBA') and item is not None:
                require(isinstance(item, list) and len(item) == 4
                        and all(type(v) in (int, float) and v == 0 for v in item),
                        'integer ledger delta failed: ' + name)
                checked.append(name)
            if isinstance(item, dict):
                visit(item, name)
    for key in ('fineLedger', 'finalState', 'coarseLedger'):
        visit((metadata or {}).get(key), key)
    return {'pass': True, 'checked': checked,
            'qualification': 'Executed integer guards/capacity/nonfinite counters hard-gated; signed float deltas remain diagnostics.'}


def catalog_identity_sha(plan):
    """Stable requested model identity, excluding labels, encoding and source capability."""
    import json
    identity = [{k: c[k] for k in ('key', 'kind', 'algorithm', 'config', 'flags') if k in c}
                for c in plan['choices']]
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def validate_build_binding(cell, choice, manifest):
    kind = choice['kind']
    if kind == 'input-reference':
        return
    allowed = manifest.get('allowedBuilds', {}).get(choice['key'], [])
    policy = 'initial-fixed-v1' if kind == 'worker-factory' else 'native-component-isolated-v1'
    require(digest(cell.get('buildManifestSHA256')) and any(
        b.get('buildManifestSHA256') == cell['buildManifestSHA256']
        and b.get('sourceHashes') == cell.get('sourceHashes') and b.get('policy') == policy
        for b in allowed), 'cell source/build not allowed for choice: ' + choice['key'])


def validate_component_isolation(proof, inp, source, authored_source=None):
    expected = authored_source.get('nativeComponentCounts') if authored_source is not None else inp.get('nativeComponentCounts')
    require(isinstance(expected, dict), 'missing independent frozen component counts')
    if authored_source is not None:
        require(expected == inp.get('nativeComponentCounts'),
                'authored native topology differs from exact common capture')
    require(proof.get('policy') == 'native-component-isolated-v1'
            and proof.get('inputSHA') == inp['sha'] and proof.get('sourceHashes') == source
            and proof.get('connectivity') == 4 and proof.get('threshold') == 0,
            'component isolation source/policy mismatch')
    components = proof.get('components', [])
    require(proof.get('totalComponentCount') == expected['components']
            and proof.get('pigmentedComponentCount') == expected['pigmented']
            and proof.get('goalRuns') == expected['components'] == len(components)
            and proof.get('waterOnlyRuns') == expected['components'] - expected['pigmented']
            and sum(c.get('pigmented') is True for c in components) == expected['pigmented'],
            'component dispatch count mismatch')
    require(len({c['id'] for c in components}) == len(components), 'duplicate component dispatch')
    planes = proof.get('originalPlaneSHA', {})
    plane_keys = {'p', 'c', 'coverage', 'solvent', 'foreign', 'original', 'paper'}
    masked_keys = plane_keys - {'original', 'paper'}
    require(set(planes) == plane_keys and all(digest(v) for v in planes.values())
            and proof.get('paperSHA') == planes['paper'], 'missing original seven planes/paper')
    for component in components:
        require(isinstance(component.get('pigmented'), bool), 'missing component pigment classification')
        if not component['pigmented']:
            require(component.get('zeroCOutputNonzero') == 0, 'water-only component generated pigment')
        expected_planes = component.get('expectedMaskedPlaneSHA', {})
        require(set(expected_planes) == set(planes) and all(digest(v) for v in expected_planes.values())
                and component.get('actualMaskedPlaneSHA') == expected_planes
                and digest(component.get('inputMaskSHA')),
                'masked source plane readback mismatch')
        require(component.get('insideOriginalChangedChannels') == {k: 0 for k in planes}
                and component.get('outsideNonzeroChannels') == {k: 0 for k in masked_keys}
                and component.get('backdropGlobalSHA') == {k: planes[k] for k in ('original', 'paper')},
                'masked source inside/outside mismatch')
        require(component.get('paperExpectedSHA') == proof['paperSHA']
                and component.get('paperActualSHA') == proof['paperSHA']
                and digest(component.get('endpointSHA'))
                and component.get('outsideEndpointChangedChannels') == 0
                and component.get('rawDryChangedChannels') == 0
                and component.get('runCount') == 1,
                'component paper/endpoint audit failed')


def assemble_fixed_matrix(shell, plan, manifest, cells, read_bytes=None):
    """Return new data only after complete exact coverage. Inputs are not mutated.

    Source proofs are explicitly supplied, never inferred from id, PNG or dry identity.
    This gate validates evidence structure, not a substitute for independent raw audit.
    """
    read_bytes = read_bytes or (lambda name: Path(name).read_bytes())
    choices = plan['choices']
    keys = [c['key'] for c in choices]
    require(len(keys) == len(set(keys)), 'duplicate catalogue key')
    inputs = {i['id']: i for i in manifest['inputs']}
    require(len(inputs) == len(manifest['inputs']), 'duplicate immutable input')
    scene_ids = [s['id'] for s in shell['scenes']]
    require(len(scene_ids) == len(set(scene_ids)) and set(scene_ids) == set(inputs),
            'scene set differs from frozen inputs')
    require(set(scene_ids) == {row['scene'] for row in plan['matrix']}, 'plan scene set mismatch')
    require([c['key'] for c in manifest['choices']] == keys, 'manifest catalogue order mismatch')
    require(manifest['registrySHA'] == plan.get('registrySourceSHA256', manifest['registrySHA']),
            'registry snapshot mismatch')
    if 'summary' in plan:
        require(plan['summary']['catalogChoices'] == len(keys), 'catalogue count mismatch')
        require(plan['summary']['allSceneSlots'] == len(keys) * len(scene_ids), 'matrix dimensions mismatch')
    choice_map = dict(zip(keys, choices))
    found = {}
    for cell in cells:
        sid, key = cell['sceneId'], cell['comparisonKey']
        require(sid in inputs and key in choice_map, 'unknown scene or catalogue key')
        require((sid, key) not in found, 'duplicate matrix cell')
        inp, choice = inputs[sid], choice_map[key]
        result, request = cell['result'], cell['request']
        tag = sid + '/' + key
        require(result.get('pass') is True and not result.get('errors'), 'failed result: ' + tag)
        require(result.get('fixtureSHA') == inp['sha'] and result.get('fixtureSHAAfter') == inp['sha'],
                'wrong immutable input SHA: ' + tag)
        require(result.get('inputUnchanged') is True, 'source mutated: ' + tag)
        require(request.get('encoding') == inp['encoding'] == result.get('encoding'), 'encoding mismatch: ' + tag)
        source = cell.get('sourceHashes', {})
        require(bool(source) and all(digest(x) for x in source.values()), 'missing source SHA: ' + tag)
        renderer = cell.get('commonRenderer', {})
        require(renderer.get('inputSHA') == inp['sha'] and renderer.get('inputDerivedScale') is True
                and renderer.get('outputNormalized') is False
                and renderer.get('displayDensityScale') == inp.get('expectedDisplayDensityScale')
                and isinstance(inp.get('expectedDisplayDensityScale'), (int, float))
                and inp['expectedDisplayDensityScale'] > 0
                and renderer.get('paperSHA') == inp['sha']['paper'], 'unproven common renderer: ' + tag)
        kind = choice['kind']
        validate_build_binding(cell, choice, manifest)
        if kind == 'worker-factory':
            ledger_audit = audit_actual_ledger_guards(result.get('metadata', {}))
            require(request.get('fixedInitialWet') is True, 'old policy request: ' + tag)
            require(request.get('algorithm') == choice['algorithm'] == result.get('algorithm')
                    and request.get('config') == choice['config'] == result.get('config'), 'wrong algorithm/config: ' + tag)
            require(result.get('requestedDomainPolicy') == 'initial-fixed-v1', 'old result policy: ' + tag)
            audit = result.get('initialWetAudit', {})
            require(audit.get('policy') == 'initial-raw-water-positive-v1' and audit.get('threshold') == 0
                    and audit.get('dryIdentity') is True and audit.get('changedDryChannels') == 0
                    and audit.get('newPigmentDryPixels') == 0, 'missing/failing initial wet audit: ' + tag)
            require(result.get('repeatExact') is True, 'repeat determinism absent: ' + tag)
        elif kind == 'native-mini':
            proof = cell.get('nativeProof', {})
            contract = proof.get('contract')
            require(proof.get('nativeCoreActual') is True
                    and proof.get('outputComposite') == 'common-optical-picture-v1',
                    'native core/common output contract absent: ' + tag)
            require(contract in ('common-optical-seed-v1', 'authored-native-replay-v1')
                    and proof.get('inputSHA') == inp['sha']
                    and all(proof.get(k) is True for k in ('rawPlanesExact', 'paperExact', 'sourceUnchanged',
                                                         'fixedInitialWet', 'roundtripExact')),
                    'native per-input source proof missing: ' + tag)
            if contract == 'authored-native-replay-v1':
                require(all(proof.get(k) is True for k in ('authoredReplayExact', 'capturedRawExact',
                                                          'nativeCoreActual', 'originalBaselinePreserved'))
                        and digest(proof.get('replaySHA')) and digest(proof.get('nativeRawSHA'))
                        and proof.get('capturedCommonSHA') == inp['sha'],
                        'authored native replay/composite proof missing: ' + tag)
                frozen_native = inp.get('authoredNativeSource', {})
                isolation = proof.get('componentIsolation', {})
                require(frozen_native.get('inputSHA') == inp['sha']
                        and frozen_native.get('originalPlaneSHA') == isolation.get('originalPlaneSHA')
                        and len(frozen_native.get('originalPlaneSHA', {})) == 7
                        and frozen_native.get('paperSHA') == isolation.get('paperSHA')
                        and frozen_native.get('replaySHA') == proof.get('replaySHA')
                        and frozen_native.get('nativeRawSHA') == proof.get('nativeRawSHA'),
                        'authored native planes not bound to frozen capture: ' + tag)
                dry = proof.get('rawDryAudit', {})
                require(dry.get('pass') is True and dry.get('changedDryChannels') == 0
                        and dry.get('inputSHA') == inp['sha'] and dry.get('rawSHA') == cell['rawSHA']
                        and dry.get('sourceHashes') == source,
                        'authored native raw dry audit missing: ' + tag)
            validate_component_isolation(proof.get('componentIsolation', {}), inp, source,
                                         inp.get('authoredNativeSource') if contract == 'authored-native-replay-v1' else None)
            require(request.get('flags') == choice['flags'] and result.get('repeatExact') is True,
                    'native flags/repeat mismatch: ' + tag)
        else:
            require(kind == 'input-reference', 'unknown choice kind: ' + tag)
            require(cell.get('inputReferenceExact') is True and cell.get('rawSHA') == inp['sha']['rgba'],
                    'unproven input reference: ' + tag)
        require(digest(cell.get('rawSHA')) and digest(cell.get('pngSHA')), 'missing output digests: ' + tag)
        raw_audit = cell.get('rawAudit', {})
        require(raw_audit.get('pass') is True and raw_audit.get('rawSHA') == cell['rawSHA']
                and raw_audit.get('inputSHA') == inp['sha'] and raw_audit.get('sourceHashes') == source,
                'independent raw audit mismatch: ' + tag)
        variant = copy.deepcopy(cell['variant'])
        require(hashlib.sha256(read_bytes(variant['imageSource'])).hexdigest() == cell['pngSHA'],
                'PNG file SHA mismatch: ' + tag)
        variant.update(comparisonKey=key, label=choice['label'], imageSHA256=cell['pngSHA'])
        if key == 'original':
            variant['id'] = 'original'
        elif kind == 'input-reference':
            variant['id'] = 'input'
        # Discard caller aliases that could display a different pre-existing public file.
        variant.pop('image', None)
        output_metadata = copy.deepcopy(result.get('metadata', {}))
        if kind == 'input-reference' and isinstance(inp.get('size'), int) and inp['size'] > 0:
            output_metadata['size'] = inp['size']
            output_metadata['outputDimensionProof'] = {'kind': 'validated-frozen-input-v1', 'width': inp['size'], 'height': inp['size'], 'inputSHA': copy.deepcopy(inp['sha'])}
        variant['evidence'] = {**copy.deepcopy(variant.get('evidence', {})), 'algorithm': choice.get('algorithm'), 'config': choice.get('config'),
                               'fixedMatrix': True, 'sourceHashes': copy.deepcopy(source),
                               'inputSHA': copy.deepcopy(inp['sha']), 'rawSHA': cell['rawSHA'],
                               'metadata': output_metadata,
                               'buildManifestSHA256': cell.get('buildManifestSHA256'),
                               'allowedBuildsSHA256': manifest.get('allowedBuildsSHA256'),
                               'nativeProof': copy.deepcopy(cell.get('nativeProof')),
                               'rawAudit': copy.deepcopy(raw_audit),
                               'commonRenderer': copy.deepcopy(renderer),
                               'initialWetAudit': copy.deepcopy(result.get('initialWetAudit')),
                               'ledgerAudit': ledger_audit if kind == 'worker-factory' else None}
        found[sid, key] = variant
    missing = [(sid, key) for sid in scene_ids for key in keys if (sid, key) not in found]
    require(not missing, 'missing matrix cells: ' + str(len(missing)))
    out = copy.deepcopy(shell)
    for scene in out['scenes']:
        scene['variants'] = [found[scene['id'], key] for key in keys]
        ids = [v['id'] for v in scene['variants']]
        require(len(ids) == len(set(ids)), 'duplicate variant DOM id: ' + scene['id'])
        scene['commonInputSHA'] = copy.deepcopy(inputs[scene['id']]['sha'])
        scene.pop('displayDiagnostics', None)
    out['variantCatalog'] = [{'key': c['key'], 'label': c['label']} for c in choices]
    out['fixedMatrixCoverage'] = {'complete': True, 'scenes': len(scene_ids), 'choices': len(keys),
                                  'cells': len(found), 'registrySHA': manifest['registrySHA'],
                                  'qualification': 'Explicit fixed-policy evidence only; no historical slot fallback.'}
    annotate_resolution(out)
    return out


def worker_cell_from_batch(report, row, *, scene_id, comparison_key, variant, raw_audit, common_renderer, build_manifest_sha,
                           closure=None, report_sha=None, closure_sha=None, row_index=None):
    """Normalize one physical batch row. Independent raw_audit must name exact bytes.

    No filename/scene inference: caller resolves the frozen input/choice indices.
    Report failures or missing immutable-build provenance cannot be papered over by
    a passing individual row. Assembly still checks every field against the manifest.
    """
    ordinary = (report.get('pass') is True and report.get('sourceStable') is True
                and report.get('contextClosed') is True and not report.get('errors'))
    scope_evidence = None
    if not ordinary:
        require(isinstance(closure, dict) and digest(report_sha) and digest(closure_sha)
                and closure.get('reportSHA256') == report_sha
                and closure.get('buildManifestSHA256') == build_manifest_sha
                and closure.get('sourceHashesBefore') == report.get('sourceHashes') == closure.get('sourceHashesAfter')
                and closure.get('verifiedReadBuild') is True and closure.get('sourceStable') is True
                and closure.get('contextClosed') is True and report.get('contextClosed') is True
                and closure.get('errors') == report.get('errors') == [],
                'batch failed without exact successful-row closure proof')
        excluded = [i for i, r in enumerate(report['cases']) if r.get('pass') is not True]
        require(closure.get('excludedFailedRows') == excluded
                and isinstance(row_index, int) and row_index not in excluded
                and 0 <= row_index < len(report['cases']) and report['cases'][row_index] == row,
                'partial closure row scope mismatch')
        scope_evidence = {'scope': 'successful-rows-only-v1', 'reportPass': report.get('pass'),
                          'reportSHA256': report_sha, 'closureSidecarSHA256': closure_sha,
                          'excludedFailedRows': excluded, 'rowIndex': row_index}
    require(row.get('pass') is True and row.get('fixedInitialWetVerified') is True
            and row.get('sameFixtureInput') is True, 'row fixed-policy evidence absent')
    result = copy.deepcopy(row['result'])
    result['pass'] = True
    variant = copy.deepcopy(variant)
    if scope_evidence:
        variant.setdefault('evidence', {})['batchScope'] = scope_evidence
    return {'sceneId': scene_id, 'comparisonKey': comparison_key,
            'request': copy.deepcopy(row['request']), 'result': result,
            'sourceHashes': copy.deepcopy(report['sourceHashes']), 'buildManifestSHA256': build_manifest_sha,
            'variant': variant, 'pngSHA': row['png']['sha256'],
            'rawSHA': row['carrier']['decodedSHA256'],
            'rawAudit': copy.deepcopy(raw_audit), 'commonRenderer': copy.deepcopy(common_renderer)}


def coverage_report(shell, plan, manifest, cells, read_bytes=None):
    """All-cell CPU validation with bounded readable missing/error inventory; no output assembly."""
    global_errors = []
    keys = [c['key'] for c in plan['choices']]
    input_ids = [i['id'] for i in manifest['inputs']]
    if len(keys) != len(set(keys)) or [c['key'] for c in manifest['choices']] != keys:
        global_errors.append('duplicate/mismatched frozen catalogue')
    if len(input_ids) != len(set(input_ids)) or set(input_ids) != {s['id'] for s in shell['scenes']} or set(input_ids) != {s['scene'] for s in plan['matrix']}:
        global_errors.append('duplicate/mismatched frozen scenes')
    if manifest['registrySHA'] != plan['registrySourceSHA256']:
        global_errors.append('registry snapshot mismatch')
    expected = {(i['id'], c['key']) for i in manifest['inputs'] for c in plan['choices']}
    counts, invalid, unknown = {}, [], []
    dom_ids = {}
    by_input = {i['id']: i for i in manifest['inputs']}
    by_choice = {c['key']: c for c in plan['choices']}
    by_scene = {s['id']: s for s in shell['scenes']}
    valid = set()
    for index, cell in enumerate(cells):
        pair = (cell.get('sceneId'), cell.get('comparisonKey'))
        counts[pair] = counts.get(pair, 0) + 1
        if pair not in expected:
            unknown.append({'index': index, 'scene': pair[0], 'key': pair[1]})
            continue
        sid, key = pair
        tiny_plan = {'choices': [by_choice[key]], 'matrix': [{'scene': sid}],
                     'registrySourceSHA256': plan['registrySourceSHA256']}
        tiny_manifest = {'inputs': [by_input[sid]], 'choices': [by_choice[key]],
                         'registrySHA': manifest['registrySHA'],
                         'allowedBuilds': manifest.get('allowedBuilds', {}),
                         'allowedBuildsSHA256': manifest.get('allowedBuildsSHA256')}
        try:
            assemble_fixed_matrix({'scenes': [by_scene[sid]]}, tiny_plan, tiny_manifest, [cell], read_bytes)
            valid.add(pair)
            kind = by_choice[key]['kind']
            vid = 'original' if key == 'original' else 'input' if kind == 'input-reference' else cell['variant']['id']
            if vid in dom_ids.setdefault(sid, {}) and dom_ids[sid][vid] != key:
                global_errors.append('duplicate variant DOM id in ' + sid + ': ' + vid)
            dom_ids[sid][vid] = key
        except (MatrixError, KeyError, OSError, TypeError) as error:
            invalid.append({'index': index, 'scene': sid, 'key': key, 'error': str(error)})
    duplicate = [{'scene': s, 'key': k, 'count': n} for (s, k), n in counts.items() if n > 1]
    missing = [{'scene': s, 'key': k} for s, k in sorted(expected - valid)]
    per_scene = [{'scene': i['id'], 'required': len(plan['choices']),
                  'validUnique': sum((i['id'], c['key']) in valid for c in plan['choices'])}
                 for i in manifest['inputs']]
    return {'complete': not (global_errors or missing or duplicate or invalid or unknown) and len(cells) == len(expected),
            'requiredCells': len(expected), 'providedCells': len(cells), 'validUniqueCells': len(valid),
            'globalErrors': global_errors, 'missing': missing, 'duplicates': duplicate, 'invalid': invalid, 'unknown': unknown,
            'perScene': per_scene,
            'qualification': 'CPU evidence/file validation only. No cells computed; old published images never used as fallback.'}


def main(argv=None):
    import argparse
    import json
    import os
    parser = argparse.ArgumentParser(description='Strict fixed-matrix CPU assembler; no render/GPU/publication.')
    parser.add_argument('--shell', required=True, type=Path)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--cells', required=True, nargs='+', type=Path)
    parser.add_argument('--references', required=True, type=Path,
                        help='Exactly one certified input-reference cell per frozen scene (30 in final matrix).')
    parser.add_argument('--allowed-builds', required=True, type=Path, help='Explicit choice→immutable manifest/source allowlist; no implicit latest build.')
    parser.add_argument('--input-catalog', required=True, type=Path, help='Frozen30 input+capture metadata catalogue.')
    parser.add_argument('--native-source-proofs', type=Path, help='Explicit certified authored input/7plane/paper/replay binding; absence blocks authored cells.')
    parser.add_argument('--component-counts', required=True, type=Path,
                        help='Independent frozen-input four-connected counts, including zero-solve scenes.')
    parser.add_argument('--coverage-report', required=True, type=Path)
    parser.add_argument('--coverage-text', type=Path, help='Optional human-readable Markdown coverage report.')
    parser.add_argument('--output', type=Path, help='Written atomically ONLY when every cell passes; never HTML/published here.')
    args = parser.parse_args(argv)
    load = lambda p: json.loads(p.read_text())
    shell, plan, manifest = map(load, (args.shell, args.plan, args.manifest))
    allowed_ledger = load(args.allowed_builds)
    require(allowed_ledger.get('catalogSHA256') == catalog_identity_sha(plan), 'allowed build catalogue identity mismatch')
    allowed_rows = allowed_ledger['choices']
    known_keys = {c['key'] for c in plan['choices']}
    require(len({r['key'] for r in allowed_rows}) == len(allowed_rows)
            and all(r['key'] in known_keys for r in allowed_rows), 'unknown/duplicate build-ledger choice')
    manifest['allowedBuilds'] = {r['key']: r['builds'] for r in allowed_rows}
    manifest['allowedBuildsSHA256'] = hashlib.sha256(args.allowed_builds.read_bytes()).hexdigest()
    catalog = load(args.input_catalog)
    require(len(catalog) == len(manifest['inputs']) and {r['id'] for r in catalog} == {i['id'] for i in manifest['inputs']},
            'frozen input catalogue scene set mismatch')
    native_sources = load(args.native_source_proofs) if args.native_source_proofs else []
    for inp in manifest['inputs']:
        record = next(r for r in catalog if r['id'] == inp['id'])
        require(record['sha'] == inp['sha'] and record['encoding'] == inp['encoding'], 'catalogue SHA/encoding mismatch')
        meta_bytes = Path(record['metadata']).read_bytes()
        require(hashlib.sha256(meta_bytes).hexdigest() == record.get('metadataSHA256'), 'capture metadata SHA mismatch')
        meta = json.loads(meta_bytes)
        if 'manifest' in meta:
            require(meta['manifest'].get('commonSHA') == inp['sha'], 'capture common input SHA mismatch')
            scale = meta['manifest'].get('pigmentScale')
        else:
            require(meta.get('source', {}).get('kind') == 'deterministic-fixture' and meta.get('sha') == inp['sha'],
                    'unknown source scale provenance')
            scale = 1
        require(isinstance(scale, (int, float)) and 0 < scale <= 1, 'invalid original source density scale')
        inp['expectedDisplayDensityScale'] = scale
        native = [r for r in native_sources if r['id'] == inp['id']]
        require(len(native) <= 1, 'duplicate authored source proof')
        if native:
            inp['authoredNativeSource'] = native[0]
    component_counts = load(args.component_counts)
    require(len(component_counts) == len(manifest['inputs'])
            and {r['id'] for r in component_counts} == {i['id'] for i in manifest['inputs']},
            'frozen component-count scene set mismatch')
    for inp in manifest['inputs']:
        row = next(r for r in component_counts if r['id'] == inp['id'])
        require(row.get('inputSHA') == inp['sha'], 'component counts not bound to frozen input SHA')
        inp['nativeComponentCounts'] = {'components': row['components'], 'pigmented': row['pigmented']}
    cells = []
    for file in args.cells:
        obj = load(file)
        cells.extend(obj if isinstance(obj, list) else obj['cells'])
    refs = load(args.references)
    refs = refs if isinstance(refs, list) else refs['cells']
    ref_keys = {c['key'] for c in plan['choices'] if c['kind'] == 'input-reference'}
    require(len(ref_keys) == 1 and len(refs) == len(manifest['inputs']), 'exact reference scene count required')
    require({r['sceneId'] for r in refs} == {i['id'] for i in manifest['inputs']}
            and all(r['comparisonKey'] in ref_keys for r in refs), 'reference set mismatch')
    cells.extend(refs)
    report = coverage_report(shell, plan, manifest, cells)
    report['allowedBuildsSHA256'] = manifest['allowedBuildsSHA256']
    report['catalogIdentitySHA256'] = catalog_identity_sha(plan)
    report['nativePigmentedGoalsMinimum'] = sum(i.get('authoredNativeSource', {}).get('nativeComponentCounts', i['nativeComponentCounts'])['pigmented'] for i in manifest['inputs']) * sum(c['kind'] == 'native-mini' for c in plan['choices'])
    report['expectedAllWetComponentGoalsIfExecuted'] = sum(i.get('authoredNativeSource', {}).get('nativeComponentCounts', i['nativeComponentCounts'])['components'] for i in manifest['inputs']) * sum(c['kind'] == 'native-mini' for c in plan['choices'])
    report['nativeCountQualification'] = 'Certified authored-native7 source counts where provided; otherwise common-input counts are provisional for native until source proof. Not observed execution totals.'
    report['componentCountsSHA256'] = hashlib.sha256(args.component_counts.read_bytes()).hexdigest()
    args.coverage_report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if args.coverage_text:
        lines = ['# Покрытие fixed-матрицы', '',
                 'Полная проверка: ' + ('PASS' if report['complete'] else 'НЕ ЗАВЕРШЕНА'),
                 f"Валидные уникальные клетки: {report['validUniqueCells']}/{report['requiredCells']}.",
                 f"Минимум pigmented native goals (не общее число вызовов): {report['nativePigmentedGoalsMinimum']}.",
                 'Это проверка доказательств; недостающие расчёты здесь не запускаются.', '',
                 '| Мазок | Проверено |', '|---|---|']
        lines += [f"| {r['scene']} | {r['validUnique']}/{r['required']} |" for r in report['perScene']]
        lines += ['', f"Пропуски: {len(report['missing'])}; дубликаты: {len(report['duplicates'])}; неверные: {len(report['invalid'])}; посторонние: {len(report['unknown'])}."]
        lines += ['- ' + message for message in report['globalErrors']]
        args.coverage_text.write_text('\n'.join(lines) + '\n')
    print(json.dumps({k: report[k] for k in ('complete', 'requiredCells', 'providedCells', 'validUniqueCells')}, ensure_ascii=False))
    if not report['complete']:
        return 2
    if args.output:
        out = assemble_fixed_matrix(shell, plan, manifest, cells)
        temp = args.output.with_name(args.output.name + '.pending-' + str(os.getpid()))
        try:
            temp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
            temp.replace(args.output)
        finally:
            if temp.exists():
                temp.unlink()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
