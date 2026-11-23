"""Child Pixel Wash: typed Qt checked flags retain their active semantics."""
import base64,copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita
from native_mask190 import png_preset
from test_child_clock132 import params132,resources132
from test_krita_size_strength import authored


def fixture(role,value,*,mask=True,axes=True,encoded=None,curve=False,timer=False):
    params=params132()
    params.update({'PaintOpSettings/isAirbrushing':'true' if timer else 'false','MaskingBrush/Enabled':'true' if mask else 'false',
                   'MaskingBrush/Preset/PressureSize':'false',
                   **{'MaskingBrush/Preset/Pressure'+k:'false' for k in ('Mirror','Scatter','Rotation','Ratio')},
                   'MaskingBrush/Preset/Pressure'+role:value,
                   'MaskingBrush/Preset/'+role+'UseCurve':'true' if curve else 'false',
                   'MaskingBrush/Preset/'+role+'Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>',
                   'MaskingBrush/Preset/'+role+'Value':'.5',
                   'MaskingBrush/Preset/HorizontalMirrorEnabled':'true' if axes else 'false',
                   'MaskingBrush/Preset/VerticalMirrorEnabled':'false',
                   'MaskingBrush/Preset/Scattering/AxisX':'true' if axes else 'false',
                   'MaskingBrush/Preset/Scattering/AxisY':'true' if axes else 'false'})
    root=ET.fromstring(Image.open(io.BytesIO(authored(params))).text['preset'])
    node=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/Pressure'+role)
    node.set('type','bytearray');node.text=encoded if encoded is not None else base64.b64encode(value.encode()).decode()
    return png_preset(root)


def convert(raw,root):
    p=root/'sample.kpp';p.write_bytes(raw);c=Catalog(root/'out');convert_krita(p,c,resources132());return c


def relevant(brush,role):
    child=brush['descriptor']['behavior']['dual']['brush']
    if role=='Mirror':return child['behavior'].get('mirror')
    if role=='Scatter':return child.get('scatter')
    if role=='Ratio':return child['behavior'].get('modulations',{}).get('roundness')
    return child['tip']['angle']


class ChildSensorQtBoolTests(unittest.TestCase):
    def test_active_yes_no_matches_true_false_stays_distinct(self):
        for role in ('Mirror','Scatter','Rotation','Ratio'):
            values={}
            for value in ('true','false','yes','no'):
                with self.subTest(role=role,value=value),tempfile.TemporaryDirectory() as tmp:
                    raw=fixture(role,value);c=convert(raw,Path(tmp))
                    self.assertEqual(c.skipped,[]);b=c.brushes[0]
                    self.assertEqual(b['descriptor']['version'],190)
                    self.assertFalse(any(n['status']=='unsupported' for n in b['compatibility']))
                    self.assertEqual(b['descriptor']['id'],finalize_identity(copy.deepcopy(b['descriptor']),raw)['id'])
                    values[value]=relevant(b,role)
            self.assertEqual(values['yes'],values['true']);self.assertEqual(values['no'],values['true'])
            self.assertNotEqual(values['false'],values['true'])

    def test_inactive_mask_axes_and_malformed(self):
        for role in ('Mirror','Scatter','Rotation','Ratio'):
            for value in ('true','false','yes','no'):
                with self.subTest(role=role,value=value),tempfile.TemporaryDirectory() as tmp:
                    c=convert(fixture(role,value,mask=False),Path(tmp));self.assertEqual(c.skipped,[])
                    self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
            with self.subTest(role=role,malformed=True),tempfile.TemporaryDirectory() as tmp:
                c=convert(fixture(role,'yes',encoded='%%%'),Path(tmp));self.assertEqual(len(c.skipped),1);self.assertEqual(c.brushes,[])
        for role in ('Mirror','Scatter'):
            with self.subTest(role=role,axes=False),tempfile.TemporaryDirectory() as tmp:
                c=convert(fixture(role,'no',axes=False),Path(tmp));self.assertEqual(c.skipped,[])
                self.assertIsNone(relevant(c.brushes[0],role))

    def test_bundle_with_neighbor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'cases.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ('Mirror','Scatter','Rotation','Ratio'):
                    for value in ('true','false','yes','no'):
                        z.writestr(role+'-'+value+'.kpp',fixture(role,value))
                z.writestr('neighbor.kpp',fixture('Mirror','false',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(root/'out');convert_krita(p,c)
            self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),17)
            for role in ('Mirror','Scatter','Rotation','Ratio'):
                found={Path(b['source']).stem.split('-')[-1]:relevant(b,role)
                       for b in c.brushes if Path(b['source']).stem.startswith(role+'-')}
                self.assertEqual(found['true'],found['yes']);self.assertEqual(found['true'],found['no'])
                self.assertNotEqual(found['true'],found['false'])

    def test_dynamic_and_timer_follow_canonical_result(self):
        for role in ('Mirror','Scatter','Rotation','Ratio'):
            for timer in (False,True):
                results={}
                for value in ('true','yes','no'):
                    with self.subTest(role=role,timer=timer,value=value),tempfile.TemporaryDirectory() as tmp:
                        c=convert(fixture(role,value,curve=True,timer=timer),Path(tmp))
                        if c.brushes:
                            results[value]=('accepted',relevant(c.brushes[0],role),c.brushes[0]['descriptor']['version'])
                        else:
                            results[value]=('skipped',c.skipped[0]['reasons'])
                self.assertEqual(results['yes'],results['true'])
                self.assertEqual(results['no'],results['true'])

    def test_unrelated_child_size_guard_remains_active(self):
        with tempfile.TemporaryDirectory() as tmp:
            raw=fixture('Mirror','no')
            root=ET.fromstring(Image.open(io.BytesIO(raw)).text['preset'])
            node=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/PressureSize')
            node.set('type','bytearray');node.text=base64.b64encode(b'yes').decode()
            c=convert(png_preset(root),Path(tmp))
            self.assertEqual(len(c.skipped),1)
            self.assertIn('Unsupported noncanonical',c.skipped[0]['reasons'][0])


if __name__=='__main__':unittest.main()
