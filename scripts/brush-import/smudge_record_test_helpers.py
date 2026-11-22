"""Compare preserved Smudge records with the intended new import semantics."""
import copy
import json
from pathlib import Path

from brush_contract import finalize_identity
from convert import Catalog, portable_bundle

_OPACITY_DETAIL = ('Native natural-cubic response compiled to256-sample float transfer '
                   'with linear lookup; sensor normalization still requires vendor calibration.')
_OPACITY_NOTE = {'feature': 'OpacityCurve', 'status': 'approximate', 'detail': _OPACITY_DETAIL}
_OPACITY_WARNING = 'OpacityCurve: ' + _OPACITY_DETAIL


def assert_old_portable_and_new_import(case, expected, actual, source, root):
    """Keep the old golden intact and permit exactly the source-confirmed change."""
    case.assertEqual(len(expected['brushes']), 1)
    case.assertEqual(expected['assets'], {})
    case.assertEqual(expected['rawCAS'], {})
    old = expected['brushes'][0]
    old_descriptor = old['descriptor']
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
    new['descriptor']['id'] = finalize_identity(new['descriptor'], source)['id']
    case.assertNotEqual(new['descriptor']['id'], old_descriptor['id'])
    features = [note['feature'] for note in new['compatibility']]
    case.assertNotIn('OpacityCurve', features)
    new['compatibility'].insert(features.index('SizeCurve') + 1, copy.deepcopy(_OPACITY_NOTE))
    warning_idx = next(i for i, warning in enumerate(new['warnings']) if warning.startswith('SizeCurve:'))
    new['warnings'].insert(warning_idx + 1, _OPACITY_WARNING)
    case.assertEqual(actual, updated)
