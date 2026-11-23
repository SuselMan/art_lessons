"""Combined child checked and curve QByteArray values on public Pixel Wash."""
import base64, copy, io, tempfile, unittest, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog, finalize_identity
from krita_import import convert_krita
from native_mask190 import png_preset
from test_child_rotation_usecurve_qt_bool import TestOtherChildCurves, normalized
from test_child_size_usecurve_qt_bool import convert
from test_child_clock132 import resources132

ROLES=('Rotation','Ratio','Mirror','Scatter')
def make(role,checked,curve,timer=False,mask=True):
    raw=TestOtherChildCurves().make(role,curve,timer,'true')
    root=ET.fromstring(Image.open(io.BytesIO(raw)).text['preset'])
    n=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/Pressure'+role)
    n.set('type','bytearray');n.text=base64.b64encode(checked.encode()).decode()
    if not mask:next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Enabled').text='false'
    return png_preset(root)

class CombinedQtBool(unittest.TestCase):
    def test_active_timer_full_descriptors(self):
        for role in ROLES:
            for timer in (False,True):
                results={}
                for checked,curve in [('true','true'),('true','yes'),('yes','true'),('no','true'),('yes','yes'),('yes','no'),('no','yes'),('no','no'),('false','yes')]:
                    with self.subTest(role=role,timer=timer,checked=checked,curve=curve), tempfile.TemporaryDirectory() as tmp:
                        raw=make(role,checked,curve,timer);c=convert(raw,Path(tmp));self.assertEqual(c.skipped,[])
                        d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],195 if timer else 190)
                        self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);results[checked,curve]=normalized(d)
                for pair in [('true','yes'),('yes','true'),('no','true'),('yes','yes'),('yes','no'),('no','yes'),('no','no')]:self.assertEqual(results['true','true'],results[pair],(role,timer,pair))
                self.assertNotEqual(results['true','true'],results['false','yes'])
    def test_inactive_mask_and_bad_bytes(self):
        for role in ROLES:
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(make(role,'yes','no',mask=False),Path(tmp));self.assertEqual(c.skipped,[]);self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
            for key in ('Pressure'+role,role+'UseCurve'):
                root=ET.fromstring(Image.open(io.BytesIO(make(role,'yes','no'))).text['preset'])
                next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+key).text='%%%'
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'x.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ROLES:
                    for v in ('true','yes','no'):z.writestr(role+'-'+v+'.kpp',make(role,v,v))
                z.writestr('neighbor.kpp',make('Rotation','yes','no',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),13)
            d={Path(b['source']).stem:b['descriptor'] for b in c.brushes}
            for role in ROLES:
                for v in ('yes','no'):self.assertEqual(normalized(d[role+'-true']),normalized(d[role+'-'+v]))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy_and_boundaries(self):
        from test_krita import kpp
        from krita_import import _child_curve_bytearray_wash, _child_checked_bytearray_wash
        for role in ROLES:
            results={}
            for value in ('true','yes','no','yes_true'):
                encoded=base64.b64encode(('yes' if value=='yes_true' else value).encode()).decode()
                encoded_curve=base64.b64encode(('true' if value=='yes_true' else value).encode()).decode()
                fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="bytearray">'+encoded+'</param><param name="MaskingBrush/Preset/'+role+'UseCurve" type="bytearray">'+encoded_curve+'</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(kpp(resources=fields),Path(tmp));self.assertEqual(c.skipped,[]);results[value]=normalized(c.brushes[0]['descriptor'])
            self.assertEqual(results['true'],results['yes']);self.assertEqual(results['true'],results['no']);self.assertEqual(results['true'],results['yes_true'])
            root=ET.fromstring(Image.open(io.BytesIO(make(role,'yes','no'))).text['preset'])
            self.assertTrue(_child_curve_bytearray_wash(root,role))
            for name,value,typ in [('PaintOpAction','1',None),('PaintOpAction','Mg==','bytearray'),('MaskingBrush/Enabled','false',None),('MaskingBrush/Preset/Pressure'+role,'yes',None)]:
                altered=copy.deepcopy(root);node=next(p for p in altered.findall('param') if p.get('name')==name);node.text=value
                if typ:node.set('type',typ)
                elif 'type' in node.attrib:del node.attrib['type']
                self.assertFalse(_child_curve_bytearray_wash(altered,role))
            duplicate=copy.deepcopy(root);ET.SubElement(duplicate,'param',name='PaintOpAction').text='2';self.assertFalse(_child_curve_bytearray_wash(duplicate,role))
            partial=copy.deepcopy(root);node=next(p for p in partial.findall('param') if p.get('name')=='MaskingBrush/Preset/'+role+'UseCurve');node.text='true';del node.attrib['type']
            self.assertFalse(_child_curve_bytearray_wash(partial,role));self.assertFalse(_child_checked_bytearray_wash(partial,role))
            self.assertFalse(_child_checked_bytearray_wash(duplicate,role))
if __name__=='__main__':unittest.main()
