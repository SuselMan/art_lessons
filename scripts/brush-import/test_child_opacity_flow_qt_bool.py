"""Qt QByteArray yes/no for child Pixel Wash Opacity/Flow curves."""
import base64
import copy
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from PIL import Image
from brush_contract import Catalog, finalize_identity
from krita_import import convert_krita
from native_mask190 import png_preset
from test_child_clock132 import params132, resources132
from test_krita_size_strength import authored


def fixture(role, value, *, mask=True, pressure='true', encoded=None):
    params=params132()
    params.update({'PaintOpSettings/isAirbrushing':'false',
                   'MaskingBrush/Enabled':'true' if mask else 'false',
                   'MaskingBrush/Preset/PressureSize':'false',
                   'MaskingBrush/Preset/Pressure'+role:pressure,
                   'MaskingBrush/Preset/'+role+'UseCurve':value,
                   'MaskingBrush/Preset/'+role+'Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})
    root=ET.fromstring(Image.open(io.BytesIO(authored(params))).text['preset'])
    node=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+role+'UseCurve')
    node.set('type','bytearray')
    node.text=encoded if encoded is not None else base64.b64encode(value.encode()).decode()
    return png_preset(root)


def converted(raw, root):
    p=root/'sample.kpp';p.write_bytes(raw)
    c=Catalog(root/'out');convert_krita(p,c,resources132())
    return c


class ChildOpacityFlowQtBoolTests(unittest.TestCase):
    def test_active_qbytearray_yes_no_matches_true_and_false_is_constant(self):
        for role in ('Opacity','Flow'):
            for pressure in ('true','false'):
                for value in ('true','false','yes','no'):
                    with self.subTest(role=role,pressure=pressure,value=value),tempfile.TemporaryDirectory() as tmp:
                        raw=fixture(role,value,pressure=pressure);c=converted(raw,Path(tmp))
                        self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1)
                        b=c.brushes[0];d=b['descriptor'];self.assertEqual(d['version'],190)
                        curve=d['behavior']['dual']['brush'][role.lower()+'ByPressure']
                        self.assertEqual(curve,[[0,1],[1,1]] if value=='false' else [[0,0],[1,1]])
                        self.assertFalse(any(n['status']=='unsupported' for n in b['compatibility']))
                        self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id'])

    def test_inactive_mask_and_malformed_input(self):
        for role in ('Opacity','Flow'):
            for value in ('true','false','yes','no'):
                with self.subTest(role=role,value=value),tempfile.TemporaryDirectory() as tmp:
                    c=converted(fixture(role,value,mask=False),Path(tmp))
                    self.assertEqual(c.skipped,[])
                    self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
            with self.subTest(role=role,invalid=True),tempfile.TemporaryDirectory() as tmp:
                c=converted(fixture(role,'yes',encoded='%%%'),Path(tmp))
                self.assertEqual(len(c.skipped),1);self.assertEqual(c.brushes,[])

    def test_bundle_preserves_neighbor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'cases.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ('Opacity','Flow'):
                    for value in ('true','false','yes','no'):
                        z.writestr(role+'-'+value+'.kpp',fixture(role,value))
                z.writestr('neighbor.kpp',fixture('Opacity','false',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(root/'out');convert_krita(p,c)
            self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),9)
            for b in c.brushes:
                if 'dual' not in b['descriptor']['behavior']:continue
                role,value=Path(b['source']).stem.split('-')[-2:]
                curve=b['descriptor']['behavior']['dual']['brush'][role.lower()+'ByPressure']
                self.assertEqual(curve,[[0,1],[1,1]] if value=='false' else [[0,0],[1,1]])


if __name__=='__main__':unittest.main()
