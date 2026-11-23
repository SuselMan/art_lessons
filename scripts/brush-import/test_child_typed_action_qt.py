import base64,copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,_pixel_action_wash
from native_mask190 import png_preset
from test_child_size_usecurve_qt_bool import convert
from test_child_mixed_qt_bool import mixed,ROLES
from test_child_rotation_usecurve_qt_bool import normalized
from test_child_clock132 import resources132

def typed(raw,contents='Mg=='):
    root=ET.fromstring(Image.open(io.BytesIO(raw)).text['preset'])
    n=next(p for p in root.findall('param') if p.get('name')=='PaintOpAction');n.set('type','bytearray');n.text=contents
    return png_preset(root)

class TypedAction(unittest.TestCase):
    def test_public_full_descriptor(self):
        for role in ROLES:
            for timer in (False,True):
                for checked,curve,ct,ut in [('true','true',True,True),('yes','no',True,True),('yes','no',False,True),('no','yes',True,False),('false','no',False,True),('true','false',True,False)]:
                    with self.subTest(role=role,timer=timer,checked=checked,curve=curve,ct=ct,ut=ut):
                        results=[]
                        for raw in (mixed(role,checked,curve,ct,ut,timer),typed(mixed(role,checked,curve,ct,ut,timer))):
                            with tempfile.TemporaryDirectory() as tmp:
                                c=convert(raw,Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);results.append(normalized(d))
                        self.assertEqual(results[0],results[1])
    def test_invalid_and_duplicates(self):
        root=ET.fromstring(Image.open(io.BytesIO(typed(mixed('Rotation','yes','no',True,False)))).text['preset']);self.assertTrue(_pixel_action_wash(root))
        for value in ('MQ==','MA==','Mw==','%%%',' Mg=='):
            changed=copy.deepcopy(root);next(p for p in changed.findall('param') if p.get('name')=='PaintOpAction').text=value;self.assertFalse(_pixel_action_wash(changed))
        ET.SubElement(root,'param',name='PaintOpAction').text='2';self.assertFalse(_pixel_action_wash(root))
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'typed.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ROLES:
                    raw=mixed(role,'yes','no',False,True);z.writestr(role+'-plain.kpp',raw);z.writestr(role+'-typed.kpp',typed(raw))
                from test_child_size_usecurve_qt_bool import fixture
                z.writestr('neighbor.kpp',fixture('true',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),9)
            d={Path(b['source']).stem:b['descriptor'] for b in c.brushes}
            for role in ROLES:self.assertEqual(normalized(d[role+'-plain']),normalized(d[role+'-typed']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy_complete(self):
        from test_krita import kpp
        for role in ROLES:
            fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="bytearray">eWVz</param><param name="MaskingBrush/Preset/'+role+'UseCurve">no</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
            raw=kpp(resources=fields);results=[]
            for data in (raw,typed(raw)):
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(data,Path(tmp));self.assertEqual(c.skipped,[]);results.append(normalized(c.brushes[0]['descriptor']))
            self.assertEqual(results[0],results[1])
            if results[0]['version']==27:self.assertEqual(results[0]['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
    def test_public_invalid_and_inactive(self):
        for role in ROLES:
            raw=mixed(role,'yes','no',False,True)
            root=ET.fromstring(Image.open(io.BytesIO(typed(raw))).text['preset'])
            next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Enabled').text='false'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(png_preset(root),Path(tmp));self.assertEqual(c.skipped,[]);self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(typed(mixed('Rotation','yes','no',False,True),'%%%'),Path(tmp));self.assertEqual(len(c.skipped),1)
        root=ET.fromstring(Image.open(io.BytesIO(typed(mixed('Rotation','yes','no',False,True)))).text['preset']);ET.SubElement(root,'param',name='PaintOpAction').text='2'
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
