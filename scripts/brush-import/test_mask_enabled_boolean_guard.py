import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from convert import Catalog
from krita_import import convert_krita, preset
from test_krita_size_strength import authored
from test_sketch_spray194 import native194

CHILD = '<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio="1" diameter="15"/></Brush>'


def pixel(action='2', mask=None):
    params = {'PaintOpAction': action, 'MaskingBrush/Preset/brush_definition': CHILD}
    if mask is not None:
        params['MaskingBrush/Enabled'] = mask
    return authored(params)


class MaskEnabledBooleanGuard(unittest.TestCase):
    def test_pixel_wash_canonical_and_noncanonical(self):
        for value, dual in [('true', True), ('1', True), ('false', False), ('0', False), (None, False)]:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(pixel(mask=value))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertEqual(out.skipped, [])
                self.assertEqual(len(out.brushes), 1)
                self.assertEqual('dual' in out.brushes[0]['descriptor'].get('behavior', {}), dual)
        for value in ('yes', 'no', '', 'garbage', ' true '):
            with self.subTest(value=value), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(pixel(mask=value))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(out.brushes)
                self.assertIn('Unsupported noncanonical MaskingBrush/Enabled for Pixel Wash', out.skipped[0]['reasons'][0])
                self.assertFalse(out.assets)

    def test_bundle_keeps_neighbor_and_does_not_change_buildup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'test.bundle'
            with ZipFile(path, 'w') as archive:
                archive.writestr('bad.kpp', pixel(mask='yes'))
                archive.writestr('valid.kpp', pixel(mask='true'))
                archive.writestr('buildup.kpp', pixel(action='1', mask='yes'))
            out = Catalog(root / 'bundle')
            convert_krita(path, out)
            self.assertEqual([x['source'] for x in out.brushes], ['buildup.kpp', 'valid.kpp'])
            self.assertEqual([x['name'] for x in out.skipped], ['bad'])
            self.assertIn('Unsupported noncanonical MaskingBrush/Enabled', out.skipped[0]['reasons'][0])
            single = root / 'valid.kpp'
            single.write_bytes(pixel(mask='true'))
            control = Catalog(root / 'control')
            convert_krita(single, control)
            self.assertEqual(out.brushes[1], control.brushes[0])

    def test_sketch_spray_wash_existing_guard(self):
        for engine in ('sketchbrush', 'spraybrush'):
            for value in ('true', 'yes'):
                with self.subTest(engine=engine, value=value), tempfile.TemporaryDirectory() as tmp:
                    path = Path(tmp) / 'test.kpp'
                    path.write_bytes(native194(engine=engine, params={'PaintOpAction': '2', 'MaskingBrush/Enabled': value}))
                    out = Catalog(Path(tmp) / 'out')
                    convert_krita(path, out)
                    self.assertFalse(out.brushes)
                    self.assertIn('Native Sketch/Spray Wash with masking brush is unsupported', out.skipped[0]['reasons'][0])

    def test_private_adapter_does_not_inherit_public_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = preset(pixel(mask='yes'), 'private.kpp', Catalog(Path(tmp) / 'out'), {}, _allow_texture_material=False)
            self.assertNotIn('dual', result['descriptor'].get('behavior', {}))
