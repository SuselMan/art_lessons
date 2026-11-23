import base64,copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,_child_notcheckable_string
from native_mask190 import png_preset
from test_child_opacity_flow_string import raw
from test_child_opacity_flow_qt_bool import converted
from test_child_rotation_usecurve_qt_bool import normalized
from test_child_clock132 import resources132

def mixed(role,pressure,curve,ut=None,timer=False,action=False,mask=True):
    root=ET.fromstring(Image.open(io.BytesIO(raw(role,pressure,curve,ut=ut,timer=timer,action=action,mask=mask))).text['preset'])
    n=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/Pressure'+role);n.set('type','bytearray');n.text=base64.b64encode(pressure.encode()).decode()
    return png_preset(root)

class MixedOpacityFlow(unittest.TestCase):
    def test_full_descriptors(self):
        for role in ('Opacity','Flow'):
            for timer in (False,True):
                for action in (False,True):
                    for pressure,curve in [('yes','yes'),('no','no'),('yes','false'),('no','true'),('false','yes'),('false','false'),('true','no')]:
                        for ut in (None,'string'):
                            with self.subTest(role=role,timer=timer,action=action,pressure=pressure,curve=curve,ut=ut),tempfile.TemporaryDirectory() as tmp:
                                refp='true' if pressure in ('yes','no') else pressure;refc='true' if curve in ('yes','no') else curve;out=[]
                                for data in (mixed(role,refp,refc,ut,timer,action),mixed(role,pressure,curve,ut,timer,action)):
                                    c=converted(data,Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),data)['id']);out.append(normalized(d))
                                self.assertEqual(out[0],out[1])
    def test_guards(self):
        for role in ('Opacity','Flow'):
            data=mixed(role,'yes','no');root=ET.fromstring(Image.open(io.BytesIO(data)).text['preset']);self.assertEqual(_child_notcheckable_string(root,role),{'Pressure'+role:'true',role+'UseCurve':'true'})
            for key,value,typ in [('PaintOpAction','3',None),('MaskingBrush/Enabled','false',None),('MaskingBrush/Preset/Pressure'+role,'%%%','bytearray')]:
                changed=copy.deepcopy(root);node=next(p for p in changed.findall('param') if p.get('name')==key);node.text=value
                if typ:node.set('type',typ)
                else:node.attrib.pop('type',None)
                self.assertNotIn('Pressure'+role,_child_notcheckable_string(changed,role))
            changed=copy.deepcopy(root);ET.SubElement(changed,'param',name='PaintOpAction').text='2';self.assertEqual(_child_notcheckable_string(changed,role),{})
            for data in (mixed(role,'yes','no',mask=False),):
                with tempfile.TemporaryDirectory() as tmp:
                    c=converted(data,Path(tmp));self.assertEqual(c.skipped,[]);self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'cases.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ('Opacity','Flow'):
                    z.writestr(role+'-true.kpp',mixed(role,'true','true'));z.writestr(role+'-yes.kpp',mixed(role,'yes','no',ut='string'))
                z.writestr('neighbor.kpp',mixed('Flow','yes','no',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),5);d={Path(x['source']).stem:x['descriptor'] for x in c.brushes}
            for role in ('Opacity','Flow'):self.assertEqual(normalized(d[role+'-true']),normalized(d[role+'-yes']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy_and_invalid(self):
        from test_krita import kpp
        for role in ('Opacity','Flow'):
            results={}
            for value in ('true','yes','no'):
                encoded=base64.b64encode(value.encode()).decode();fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="bytearray">'+encoded+'</param><param name="MaskingBrush/Preset/'+role+'UseCurve" type="string">'+value+'</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=converted(kpp(resources=fields),Path(tmp));self.assertEqual(c.skipped,[]);results[value]=normalized(c.brushes[0]['descriptor'])
            self.assertEqual(results['true'],results['yes']);self.assertEqual(results['true'],results['no'])
            if results['true']['version']==27:self.assertEqual(results['true']['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
            root=ET.fromstring(Image.open(io.BytesIO(mixed(role,'yes','no'))).text['preset']);next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/Pressure'+role).text='%%%'
            with tempfile.TemporaryDirectory() as tmp:
                c=converted(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
