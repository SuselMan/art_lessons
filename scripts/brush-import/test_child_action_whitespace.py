import copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,_pixel_action_wash
from native_mask190 import png_preset
from test_child_typed_action_qt import typed
from test_child_mixed_qt_bool import mixed,ROLES
from test_child_rotation_usecurve_qt_bool import normalized
from test_child_size_usecurve_qt_bool import convert,fixture
from test_child_clock132 import resources132

class ActionWhitespace(unittest.TestCase):
    def test_public_descriptors(self):
        for role in ROLES:
            for timer in (False,True):
                canonical=mixed(role,'yes','no',False,True,timer)
                for val in (' Mg==','M g==','Mg==\n','\nM\tg= = '):
                    with self.subTest(role=role,timer=timer,val=val):
                        results=[]
                        for raw in (canonical,typed(canonical,val)):
                            with tempfile.TemporaryDirectory() as tmp:
                                c=convert(raw,Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);results.append(normalized(d))
                        self.assertEqual(results[0],results[1])
    def test_invalid_inactive(self):
        root=ET.fromstring(Image.open(io.BytesIO(typed(mixed('Rotation','yes','no',False,True),' M g== '))).text['preset'])
        self.assertTrue(_pixel_action_wash(root))
        for value in (' M Q== ',' M A== ',' M w== ',' Mg=! '):
            altered=copy.deepcopy(root);next(p for p in altered.findall('param') if p.get('name')=='PaintOpAction').text=value;self.assertFalse(_pixel_action_wash(altered))
        duplicate=copy.deepcopy(root);ET.SubElement(duplicate,'param',name='PaintOpAction').text='2';self.assertFalse(_pixel_action_wash(duplicate))
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(png_preset(duplicate),Path(tmp));self.assertEqual(len(c.skipped),1)
        next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Enabled').text='false'
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(png_preset(root),Path(tmp));self.assertEqual(c.skipped,[]);self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'test.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ROLES:
                    raw=mixed(role,'yes','no',False,True);z.writestr(role+'-plain.kpp',raw);z.writestr(role+'-space.kpp',typed(raw,' M g==\n'))
                z.writestr('neighbor.kpp',fixture('true',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),9)
            d={Path(b['source']).stem:b['descriptor'] for b in c.brushes}
            for role in ROLES:self.assertEqual(normalized(d[role+'-plain']),normalized(d[role+'-space']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy_and_other_actions(self):
        from test_krita import kpp
        for role in ROLES:
            fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="bytearray">eWVz</param><param name="MaskingBrush/Preset/'+role+'UseCurve">no</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
            raw=kpp(resources=fields);results=[]
            for data in (raw,typed(raw,' M g==\n')):
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(data,Path(tmp));self.assertEqual(c.skipped,[]);results.append(normalized(c.brushes[0]['descriptor']))
            self.assertEqual(results[0],results[1])
            if results[0]['version']==27:self.assertEqual(results[0]['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
        for value in ('MA==','Mw==','%%%'):
            results=[]
            for data in (value,' '+value+' '):
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(typed(mixed('Rotation','yes','no',False,True),data),Path(tmp))
                    results.append(('skip',c.skipped[0]['reasons']) if c.skipped else ('ok',normalized(c.brushes[0]['descriptor'])))
            self.assertEqual(results[0],results[1])
