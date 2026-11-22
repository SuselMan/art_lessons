import base64
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, PngImagePlugin

from convert import Catalog
from krita_import import convert_krita, preset
from test_krita_size_strength import authored
from test_sketch_spray194 import native194

CHILD = '<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio="1" diameter="15"/></Brush>'


def pixel(action='2', mask=None):
    params = {'MaskingBrush/Preset/brush_definition': CHILD}
    if action is not None:
        params['PaintOpAction'] = action
    if mask is not None:
        params['MaskingBrush/Enabled'] = mask
    return authored(params)


def typed_action(payload):
    image = Image.open(io.BytesIO(pixel(action='1', mask='yes')))
    image.load()
    root = ET.fromstring(image.info['preset'])
    action = next(p for p in root.findall('param') if p.get('name') == 'PaintOpAction')
    action.set('type', 'bytearray')
    action.text = payload
    meta = PngImagePlugin.PngInfo()
    meta.add_text('preset', ET.tostring(root, encoding='unicode'))
    output = io.BytesIO()
    image.save(output, format='PNG', pnginfo=meta)
    return output.getvalue()


def typed_mask(payload):
    image = Image.open(io.BytesIO(pixel(action='2', mask='true')))
    image.load()
    root = ET.fromstring(image.info['preset'])
    mask = next(p for p in root.findall('param') if p.get('name') == 'MaskingBrush/Enabled')
    mask.set('type', 'bytearray')
    mask.text = payload
    meta = PngImagePlugin.PngInfo()
    meta.add_text('preset', ET.tostring(root, encoding='unicode'))
    output = io.BytesIO()
    image.save(output, format='PNG', pnginfo=meta)
    return output.getvalue()


class MaskEnabledBooleanGuard(unittest.TestCase):
    def test_pixel_wash_canonical_and_noncanonical(self):
        for value, dual in [('true', True), ('1', True), ('false', False), ('0', False), ('', False), (None, False)]:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(pixel(mask=value))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertEqual(out.skipped, [])
                self.assertEqual(len(out.brushes), 1)
                self.assertEqual('dual' in out.brushes[0]['descriptor'].get('behavior', {}), dual)
        for value in ('yes', 'no', 'garbage', ' true '):
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
                archive.writestr('bad-zero.kpp', pixel(action='0', mask='yes'))
                archive.writestr('bad-three.kpp', pixel(action='3', mask='yes'))
                archive.writestr('valid.kpp', pixel(mask='true'))
                archive.writestr('buildup.kpp', pixel(action='1', mask='yes'))
            out = Catalog(root / 'bundle')
            convert_krita(path, out)
            self.assertEqual([x['source'] for x in out.brushes], ['buildup.kpp', 'valid.kpp'])
            self.assertEqual([x['name'] for x in out.skipped], ['bad-three', 'bad-zero', 'bad'])
            self.assertIn('Unsupported noncanonical MaskingBrush/Enabled', out.skipped[0]['reasons'][0])
            single = root / 'valid.kpp'
            single.write_bytes(pixel(mask='true'))
            control = Catalog(root / 'control')
            convert_krita(single, control)
            self.assertEqual(out.brushes[1], control.brushes[0])

    def test_present_action_wash_and_absent_or_integer_one_buildup(self):
        for action in ('0', '3', '02', '-1', 'garbage', ''):
            with self.subTest(action=action), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(pixel(action=action, mask='yes'))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(out.brushes)
                self.assertIn('Unsupported noncanonical MaskingBrush/Enabled', out.skipped[0]['reasons'][0])
        for action in (None, '1', '01', '+1', ' 1 '):
            with self.subTest(action=action), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(pixel(action=action, mask='yes'))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(any('Unsupported noncanonical MaskingBrush/Enabled' in str(row) for row in out.skipped))

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

    def test_typed_mask_disabled_and_enabled(self):
        for source in (b'', b'0', b'false', b'FALSE'):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(typed_mask(base64.b64encode(source).decode()))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertEqual(out.skipped, [])
                self.assertEqual(len(out.brushes), 1)
                self.assertNotIn('dual', out.brushes[0]['descriptor'].get('behavior', {}))
        for payload in ('dHJ1ZQ==', 'MQ==', 'eWVz', '@@@', '/w=='):
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(typed_mask(payload))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(out.brushes)
                self.assertIn('Unsupported noncanonical MaskingBrush/Enabled', out.skipped[0]['reasons'][0])

    def test_bytearray_action_type_decoded_before_public_guard(self):
        for source in (b'1', b'01', b' +1 '):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(typed_action(base64.b64encode(source).decode()))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(any('Unsupported noncanonical MaskingBrush/Enabled' in str(row) for row in out.skipped))
                self.assertFalse(any('Unsupported typed PaintOpAction' in str(row) for row in out.skipped))
        for source in (b'0', b'2', b'3', b'bad'):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(typed_action(base64.b64encode(source).decode()))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(out.brushes)
                self.assertIn('Unsupported noncanonical MaskingBrush/Enabled', out.skipped[0]['reasons'][0])
        for payload in ('@@@', '/w=='):
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'test.kpp'
                path.write_bytes(typed_action(payload))
                out = Catalog(Path(tmp) / 'out')
                convert_krita(path, out)
                self.assertFalse(out.brushes)
                self.assertIn('Unsupported typed PaintOpAction', out.skipped[0]['reasons'][0])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'typed.bundle'
            with ZipFile(path, 'w') as archive:
                archive.writestr('buildup.kpp', typed_action('MQ=='))
                archive.writestr('wash.kpp', typed_action('Mg=='))
                archive.writestr('valid.kpp', pixel(mask='true'))
            out = Catalog(root / 'out')
            convert_krita(path, out)
            self.assertTrue(any(row['source'] == 'valid.kpp' for row in out.brushes))
            self.assertTrue(any(row['name'] == 'wash' and 'Unsupported noncanonical MaskingBrush/Enabled' in row['reasons'][0] for row in out.skipped))
            self.assertFalse(any(row['name'] == 'buildup' and 'Unsupported noncanonical MaskingBrush/Enabled' in row['reasons'][0] for row in out.skipped))
