"""Qt QByteArray SizeUseCurve on the public Pixel Wash child path."""
import base64,copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita
from native_mask190 import png_preset
from test_child_clock132 import params132,resources132
from test_krita import kpp
from test_krita_size_strength import authored


def fixture(value, *, mask=True, checked='true', timer=False, encoded=None,
            typed=True, action='2', simple=False):
    params=params132()
    params.update({'PaintOpSettings/isAirbrushing':'true' if timer else 'false',
                   'PaintOpAction':action,'MaskingBrush/Enabled':'true' if mask else 'false',
                   'MaskingBrush/UseMasterSize':'true','MaskingBrush/MasterSizeCoeff':'1',
                   'MaskingBrush/Preset/PressureSize':checked,
                   'MaskingBrush/Preset/SizeValue':'1',
                   'MaskingBrush/Preset/SizeUseCurve':value,
                   'MaskingBrush/Preset/SizeSensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'})
    if simple:
        params['MaskingBrush/UseMasterSize']='true'
        params['MaskingBrush/Preset/brush_definition']='<Brush type="auto_brush" spacing=".1"><MaskGenerator id="default" type="circle" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>'
    root=ET.fromstring(Image.open(io.BytesIO(authored(params))).text['preset'])
    node=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/SizeUseCurve')
    if typed:
        node.set('type','bytearray');node.text=encoded if encoded is not None else base64.b64encode(value.encode()).decode()
    return png_preset(root)


def convert(raw,root):
    p=root/'sample.kpp';p.write_bytes(raw);c=Catalog(root/'out');convert_krita(p,c,resources132());return c


class ChildSizeQtBoolTests(unittest.TestCase):
    def test_active_yes_no_true_false_190_195(self):
        for timer in (False,True):
            for value in ('true','false','yes','no'):
                with self.subTest(timer=timer,value=value),tempfile.TemporaryDirectory() as tmp:
                    raw=fixture(value,timer=timer);c=convert(raw,Path(tmp))
                    self.assertEqual(c.skipped,[]);b=c.brushes[0];d=b['descriptor']
                    self.assertEqual(d['version'],195 if timer else 190)
                    curve=d['behavior']['dual']['brush']['sizeByPressure']
                    self.assertEqual(curve,[[0,1],[1,1]] if value=='false' else [[0,0],[1,1]])
                    self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id'])

    def test_simple_legacy_candidate_is_routed_to_190(self):
        for value in ('true','yes','no'):
            with self.subTest(value=value),tempfile.TemporaryDirectory() as tmp:
                fields=('<param name="PaintOpAction">2</param>'
                        '<param name="MaskingBrush/Enabled">true</param>'
                        '<param name="MaskingBrush/UseMasterSize">true</param>'
                        '<param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param>'
                        '<param name="MaskingBrush/Preset/PressureSize">true</param>'
                        '<param name="MaskingBrush/Preset/SizeUseCurve" type="bytearray">'+base64.b64encode(value.encode()).decode()+'</param>'
                        '<param name="MaskingBrush/Preset/SizeSensor"><![CDATA[<params id="pressure"/>]]></param>')
                c=convert(kpp(resources=fields),Path(tmp))
                self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor']
                self.assertEqual(d['version'],27 if value=='true' else 190)
                self.assertEqual(d['behavior']['dual']['brush']['sizeByPressure'],[[0,0],[1,1]])

    def test_inactive_mask_checked_false_and_malformed(self):
        for value in ('true','false','yes','no'):
            with self.subTest(value=value),tempfile.TemporaryDirectory() as tmp:
                c=convert(fixture(value,mask=False),Path(tmp));self.assertEqual(c.skipped,[])
                self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
            with self.subTest(checked=False,value=value),tempfile.TemporaryDirectory() as tmp:
                c=convert(fixture(value,checked='false'),Path(tmp));self.assertEqual(c.skipped,[])
                self.assertEqual(c.brushes[0]['descriptor']['behavior']['dual']['brush']['sizeByPressure'],[[0,1],[1,1]])
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(fixture('yes',encoded='%%%'),Path(tmp));self.assertEqual(len(c.skipped),1);self.assertFalse(c.brushes)

    def test_other_guards_are_preserved(self):
        typed_action=ET.fromstring(Image.open(io.BytesIO(fixture('yes'))).text['preset'])
        action=next(p for p in typed_action.findall('param') if p.get('name')=='PaintOpAction')
        action.set('type','bytearray');action.text=base64.b64encode(b'2').decode()
        root_guard=ET.fromstring(Image.open(io.BytesIO(fixture('yes'))).text['preset'])
        for key,value in (('PressureSize','true'),('SizeUseCurve','yes')):
            node=next((p for p in root_guard.findall('param') if p.get('name')==key),None)
            if node is None:node=ET.SubElement(root_guard,'param',name=key)
            node.text=value
        duplicate=ET.fromstring(Image.open(io.BytesIO(fixture('yes'))).text['preset'])
        ET.SubElement(duplicate,'param',name='MaskingBrush/Preset/PressureSize').text='true'
        for raw in (fixture('yes',typed=False),fixture('yes',action='0'),png_preset(typed_action),png_preset(root_guard),png_preset(duplicate)):
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(raw,Path(tmp));self.assertEqual(len(c.skipped),1)
                self.assertIn('Unsupported noncanonical',c.skipped[0]['reasons'][0])

    def test_bundle_with_neighbor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'cases.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for value in ('true','false','yes','no'):
                    z.writestr(value+'.kpp',fixture(value))
                z.writestr('neighbor.kpp',fixture('no',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(root/'out');convert_krita(p,c)
            self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),5)
            for b in c.brushes:
                value=Path(b['source']).stem
                if value=='neighbor':self.assertNotIn('dual',b['descriptor']['behavior']);continue
                curve=b['descriptor']['behavior']['dual']['brush']['sizeByPressure']
                self.assertEqual(curve,[[0,1],[1,1]] if value=='false' else [[0,0],[1,1]])


if __name__=='__main__':unittest.main()
