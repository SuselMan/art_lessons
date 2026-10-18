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
                and renderer.get('outputNormalized') is False, 'unproven common renderer: ' + tag)
        kind = choice['kind']
        if kind == 'worker-factory':
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
            require(contract in ('common-optical-seed-v1', 'authored-native-replay-v1')
                    and proof.get('inputSHA') == inp['sha']
                    and all(proof.get(k) is True for k in ('rawPlanesExact', 'paperExact', 'sourceUnchanged',
                                                         'fixedInitialWet', 'roundtripExact')),
                    'native per-input source proof missing: ' + tag)
            if contract == 'authored-native-replay-v1':
                require(all(proof.get(k) is True for k in ('authoredReplayExact', 'capturedRawExact',
                                                          'nativeCompositeActual', 'originalBaselinePreserved'))
                        and digest(proof.get('replaySHA')) and digest(proof.get('nativeRawSHA'))
                        and proof.get('capturedCommonSHA') == inp['sha'],
                        'authored native replay/composite proof missing: ' + tag)
                dry = proof.get('rawDryAudit', {})
                require(dry.get('pass') is True and dry.get('changedDryChannels') == 0
                        and dry.get('inputSHA') == inp['sha'] and dry.get('rawSHA') == cell['rawSHA']
                        and dry.get('sourceHashes') == source,
                        'authored native raw dry audit missing: ' + tag)
            require(request.get('flags') == choice['flags'] and result.get('repeatExact') is True,
                    'native flags/repeat mismatch: ' + tag)
        else:
            require(kind == 'input-reference', 'unknown choice kind: ' + tag)
            require(cell.get('inputReferenceExact') is True, 'unproven input reference: ' + tag)
        require(digest(cell.get('rawSHA')) and digest(cell.get('pngSHA')), 'missing output digests: ' + tag)
        raw_audit = cell.get('rawAudit', {})
        require(raw_audit.get('pass') is True and raw_audit.get('rawSHA') == cell['rawSHA']
                and raw_audit.get('inputSHA') == inp['sha'] and raw_audit.get('sourceHashes') == source,
                'independent raw audit mismatch: ' + tag)
        variant = copy.deepcopy(cell['variant'])
        require(hashlib.sha256(read_bytes(variant['imageSource'])).hexdigest() == cell['pngSHA'],
                'PNG file SHA mismatch: ' + tag)
        variant.update(comparisonKey=key, label=choice['label'], imageSHA256=cell['pngSHA'])
        # Discard caller aliases that could display a different pre-existing public file.
        variant.pop('image', None)
        variant['evidence'] = {'algorithm': choice.get('algorithm'), 'config': choice.get('config'),
                               'fixedMatrix': True, 'sourceHashes': copy.deepcopy(source),
                               'inputSHA': copy.deepcopy(inp['sha']), 'rawSHA': cell['rawSHA'],
                               'metadata': copy.deepcopy(result.get('metadata', {})),
                               'nativeProof': copy.deepcopy(cell.get('nativeProof'))}
        found[sid, key] = variant
    missing = [(sid, key) for sid in scene_ids for key in keys if (sid, key) not in found]
    require(not missing, 'missing matrix cells: ' + str(len(missing)))
    out = copy.deepcopy(shell)
    for scene in out['scenes']:
        scene['variants'] = [found[scene['id'], key] for key in keys]
        scene['commonInputSHA'] = copy.deepcopy(inputs[scene['id']]['sha'])
        scene.pop('displayDiagnostics', None)
    out['variantCatalog'] = [{'key': c['key'], 'label': c['label']} for c in choices]
    out['fixedMatrixCoverage'] = {'complete': True, 'scenes': len(scene_ids), 'choices': len(keys),
                                  'cells': len(found), 'registrySHA': manifest['registrySHA'],
                                  'qualification': 'Explicit fixed-policy evidence only; no historical slot fallback.'}
    annotate_resolution(out)
    return out


def worker_cell_from_batch(report, row, *, scene_id, comparison_key, variant, raw_audit, common_renderer):
    """Normalize one physical batch row. Independent raw_audit must name exact bytes.

    No filename/scene inference: caller resolves the frozen input/choice indices.
    Report failures or missing immutable-build provenance cannot be papered over by
    a passing individual row. Assembly still checks every field against the manifest.
    """
    require(report.get('pass') is True and report.get('sourceStable') is True
            and report.get('contextClosed') is True and not report.get('errors'),
            'batch failed, source changed or context not closed')
    require(row.get('pass') is True and row.get('fixedInitialWetVerified') is True
            and row.get('sameFixtureInput') is True, 'row fixed-policy evidence absent')
    result = copy.deepcopy(row['result'])
    result['pass'] = True
    return {'sceneId': scene_id, 'comparisonKey': comparison_key,
            'request': copy.deepcopy(row['request']), 'result': result,
            'sourceHashes': copy.deepcopy(report['sourceHashes']),
            'variant': copy.deepcopy(variant), 'pngSHA': row['png']['sha256'],
            'rawSHA': row['carrier']['decodedSHA256'],
            'rawAudit': copy.deepcopy(raw_audit), 'commonRenderer': copy.deepcopy(common_renderer)}
