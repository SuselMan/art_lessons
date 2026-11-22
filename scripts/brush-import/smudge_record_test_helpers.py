"""Compare preserved Smudge records with the intended new import semantics."""
import copy
import hashlib
import json
from pathlib import Path

from brush_contract import finalize_identity
from convert import Catalog, portable_bundle

_OPACITY_DETAIL = ('Native natural-cubic response compiled to256-sample float transfer '
                   'with linear lookup; sensor normalization still requires vendor calibration.')
_OPACITY_NOTE = {'feature': 'OpacityCurve', 'status': 'approximate', 'detail': _OPACITY_DETAIL}
_OPACITY_WARNING = 'OpacityCurve: ' + _OPACITY_DETAIL


def reference_id(descriptor, source):
    # Deliberately independent of production finalize_identity and constants.
    rendering = {key: value for key, value in descriptor.items() if key != 'id'}
    identity = {'schemaVersion': 1, 'importerRenderingVersion': 3,
                'sourceSettingsSha256': hashlib.sha256(source).hexdigest(), 'rendering': rendering}
    payload = json.dumps(identity, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    return 'imported-' + hashlib.sha256(payload).hexdigest()[:24]


def assert_old_portable_and_new_import(case, expected, actual, source, root, version, key):
    """Keep the old golden intact and permit exactly the source-confirmed change."""
    case.assertEqual(len(expected['brushes']), 1)
    case.assertEqual(expected['assets'], {})
    case.assertEqual(expected['rawCAS'], {})
    fixture_dir = Path(__file__).parent / 'fixtures'
    goldens = json.loads((fixture_dir / 'smudge_notcheckable_import_ids.json').read_text())
    baseline_path = fixture_dir / ('legacy_foreground_pre' + version + '.json')
    case.assertEqual(hashlib.sha256(baseline_path.read_bytes()).hexdigest(),
                     goldens['provenance']['baselineFixtures'][baseline_path.name])
    fixed = goldens['cases'][version][key]
    case.assertEqual(hashlib.sha256(source).hexdigest(), fixed['sourceSha256'])
    old = expected['brushes'][0]
    old_descriptor = old['descriptor']
    case.assertEqual(old_descriptor['id'], fixed['oldId'])
    case.assertEqual(reference_id(old_descriptor, source), fixed['oldId'])
    case.assertEqual(old_descriptor['id'], finalize_identity(copy.deepcopy(old_descriptor), source)['id'])
    case.assertEqual(old_descriptor['opacityByPressure'], [[0, 1], [1, 1]])

    portable = Path(root) / 'historical.grafetto-brushes.json'
    portable.write_text(json.dumps({'library': {'schemaVersion': 1, 'brushes': expected['brushes'],
                                                'assets': [], 'skipped': []}, 'assets': {}}))
    restored = Catalog(Path(root) / 'historical-portable')
    portable_bundle(portable, restored)
    case.assertEqual(restored.brushes, expected['brushes'])
    case.assertEqual(restored.assets, expected['assets'])

    # Derive a whole expected record from the immutable golden and explicit
    # independently established change; no unlisted field may drift.
    updated = copy.deepcopy(expected)
    new = updated['brushes'][0]
    new['descriptor']['opacityByPressure'] = [[0, 0], [1, 1]]
    case.assertEqual(reference_id(new['descriptor'], source), fixed['newId'])
    case.assertEqual(finalize_identity(copy.deepcopy(new['descriptor']), source)['id'], fixed['newId'])
    new['descriptor']['id'] = fixed['newId']
    case.assertNotEqual(new['descriptor']['id'], old_descriptor['id'])
    features = [note['feature'] for note in new['compatibility']]
    case.assertNotIn('OpacityCurve', features)
    new['compatibility'].insert(features.index('SizeCurve') + 1, copy.deepcopy(_OPACITY_NOTE))
    warning_idx = next(i for i, warning in enumerate(new['warnings']) if warning.startswith('SizeCurve:'))
    new['warnings'].insert(warning_idx + 1, _OPACITY_WARNING)
    case.assertEqual(actual, updated)
