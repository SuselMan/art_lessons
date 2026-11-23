import base64,copy,io,tempfile,unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from native_mask190 import png_preset
from test_child_combined_qt_bool import make,ROLES
from test_child_rotation_usecurve_qt_bool import normalized
from test_child_size_usecurve_qt_bool import convert

def mixed(role,checked,curve,ct,ut,timer=False):
    root=ET.fromstring(Image.open(io.BytesIO(make(role,checked,curve,timer))).text['preset'])
    for key,value,typed in [('Pressure'+role,checked,ct),(role+'UseCurve',curve,ut)]:
        n=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+key)
        if typed:n.set('type','bytearray');n.text=base64.b64encode(value.encode()).decode()
        else:n.attrib.pop('type',None);n.text=value
    return png_preset(root)

class MixedQt(unittest.TestCase):
    def test_public(self):
        for role in ROLES:
            for timer in (False,True):
                results={}
                for checked,curve,ct,ut in [('true','true',True,True),('yes','yes',True,False),('no','no',True,False),('yes','yes',False,True),('no','no',False,True)]:
                    with self.subTest(role=role,timer=timer,checked=checked,ct=ct,ut=ut),tempfile.TemporaryDirectory() as tmp:
                        raw=mixed(role,checked,curve,ct,ut,timer);c=convert(raw,Path(tmp))
                        if c.brushes:
                            from brush_contract import finalize_identity
                            self.assertEqual(c.brushes[0]['descriptor']['id'],finalize_identity(copy.deepcopy(c.brushes[0]['descriptor']),raw)['id'])
                        results[checked,ct,ut]=('skipped',c.skipped) if c.skipped else ('ok',normalized(c.brushes[0]['descriptor']))
                for key in [('yes',True,False),('no',True,False),('yes',False,True),('no',False,True)]:self.assertEqual(results['true',True,True],results[key],(role,timer,key))
    def test_legacy(self):
        from test_krita import kpp
        for role in ROLES:
            values={}
            for name,checked,curve,ct,ut in [('canonical','true','true',True,True),('a','yes','no',True,False),('b','no','yes',False,True)]:
                def field(key,value,typed):
                    return '<param name="MaskingBrush/Preset/'+key+'"'+(' type="bytearray"' if typed else '')+'>'+(base64.b64encode(value.encode()).decode() if typed else value)+'</param>'
                fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param>'+field('Pressure'+role,checked,ct)+field(role+'UseCurve',curve,ut)+'<param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(kpp(resources=fields),Path(tmp));self.assertEqual(c.skipped,[]);values[name]=normalized(c.brushes[0]['descriptor'])
            self.assertEqual(values['canonical'],values['a']);self.assertEqual(values['canonical'],values['b'])
    def test_guards_and_malformed(self):
        from krita_import import _child_mixed_qt_wash
        for role in ROLES:
            root=ET.fromstring(Image.open(io.BytesIO(mixed(role,'yes','yes',False,True))).text['preset'])
            self.assertEqual(_child_mixed_qt_wash(root,role),('true','true'))
            for key,value,typ in [('PaintOpAction','1',None),('PaintOpAction','Mg==','bytearray'),('MaskingBrush/Enabled','false',None),('MaskingBrush/Preset/Pressure'+role,'false',None),('MaskingBrush/Preset/'+role+'UseCurve','%%%','bytearray')]:
                changed=copy.deepcopy(root);n=next(p for p in changed.findall('param') if p.get('name')==key);n.text=value
                if typ:n.set('type',typ)
                else:n.attrib.pop('type',None)
                self.assertIsNone(_child_mixed_qt_wash(changed,role))
            changed=copy.deepcopy(root);ET.SubElement(changed,'param',name='PaintOpAction').text='2';self.assertIsNone(_child_mixed_qt_wash(changed,role))
    def test_bundle(self):
        import zipfile
        from brush_contract import Catalog
        from krita_import import convert_krita
        from test_child_clock132 import resources132
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'mixed.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ROLES:
                    z.writestr(role+'-true.kpp',mixed(role,'true','true',True,True))
                    z.writestr(role+'-mixed.kpp',mixed(role,'yes','no',False,True))
                from test_child_size_usecurve_qt_bool import fixture as neighbor
                z.writestr('neighbor.kpp',neighbor('true',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),9)
            d={Path(b['source']).stem:b['descriptor'] for b in c.brushes}
            for role in ROLES:self.assertEqual(normalized(d[role+'-true']),normalized(d[role+'-mixed']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_disabled_and_malformed_public(self):
        for role in ROLES:
            for checked,curve,ct,ut in [('false','yes',False,True),('false','no',True,False),('yes','false',False,True),('no','false',True,False)]:
                expected=('false','false',True,True) if checked=='false' else ('true','false',True,True)
                outputs=[]
                for args in ((checked,curve,ct,ut),expected):
                    with tempfile.TemporaryDirectory() as tmp:
                        c=convert(mixed(role,*args),Path(tmp));self.assertEqual(c.skipped,[]);outputs.append(normalized(c.brushes[0]['descriptor']))
                self.assertEqual(outputs[0],outputs[1],(role,checked,curve))
            root=ET.fromstring(Image.open(io.BytesIO(mixed(role,'yes','no',False,True))).text['preset'])
            next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+role+'UseCurve').text='%%%'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
