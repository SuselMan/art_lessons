import copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,_child_notcheckable_string
from native_mask190 import png_preset
from test_child_opacity_flow_qt_bool import fixture as original,converted
from test_child_typed_action_qt import typed
from test_child_clock132 import resources132
from test_child_rotation_usecurve_qt_bool import normalized

def raw(role,pressure,curve,*,pt=None,ut=None,timer=False,action=False,mask=True):
    root=ET.fromstring(Image.open(io.BytesIO(original(role,'true',mask=mask))).text['preset'])
    for name,value,typ in [('Pressure'+role,pressure,pt),(role+'UseCurve',curve,ut),('PaintOpSettings/isAirbrushing','true' if timer else 'false',None)]:
        key=name if name.startswith('PaintOp') else 'MaskingBrush/Preset/'+name
        node=next((p for p in root.findall('param') if p.get('name')==key),None)
        if node is None:node=ET.SubElement(root,'param',name=key)
        node.text=value;node.attrib.pop('type',None)
        if typ:node.set('type',typ)
    data=png_preset(root)
    return typed(data,' M g== ') if action else data

class OpacityFlowString(unittest.TestCase):
    def test_full_descriptor(self):
        for role in ('Opacity','Flow'):
            for timer in (False,True):
                for action in (False,True):
                    for pressure,curve in [('yes','yes'),('no','no'),('false','yes'),('yes','false'),('no','true')]:
                        for pt,ut in ((None,None),('string',None),(None,'string'),('string','string')):
                            with self.subTest(role=role,timer=timer,action=action,pressure=pressure,curve=curve,pt=pt,ut=ut),tempfile.TemporaryDirectory() as tmp:
                                canonical_pressure='true' if pressure in ('yes','no') else pressure
                                canonical_curve='true' if curve in ('yes','no') else curve
                                outputs=[]
                                for data in (raw(role,canonical_pressure,canonical_curve,timer=timer,action=action),raw(role,pressure,curve,pt=pt,ut=ut,timer=timer,action=action)):
                                    c=converted(data,Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),data)['id']);outputs.append(normalized(d))
                                self.assertEqual(outputs[0],outputs[1])
    def test_guard_inactive(self):
        for role in ('Opacity','Flow'):
            root=ET.fromstring(Image.open(io.BytesIO(raw(role,'yes','no',pt='string'))).text['preset']);self.assertEqual(_child_notcheckable_string(root,role),{'Pressure'+role:'true',role+'UseCurve':'true'})
            for name,value,typ in [('PaintOpAction','3',None),('MaskingBrush/Enabled','false',None),('MaskingBrush/Preset/'+role+'UseCurve','%%%','bytearray')]:
                changed=copy.deepcopy(root);n=next(p for p in changed.findall('param') if p.get('name')==name);n.text=value
                if typ:n.set('type',typ)
                else:n.attrib.pop('type',None)
                result=_child_notcheckable_string(changed,role)
                if name.endswith('UseCurve'):self.assertNotIn(role+'UseCurve',result)
                else:self.assertEqual(result,{})
            changed=copy.deepcopy(root);ET.SubElement(changed,'param',name='PaintOpAction').text='2';self.assertEqual(_child_notcheckable_string(changed,role),{})
            with tempfile.TemporaryDirectory() as tmp:
                c=converted(raw(role,'yes','no',mask=False),Path(tmp));self.assertEqual(c.skipped,[]);self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'test.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ('Opacity','Flow'):
                    z.writestr(role+'-true.kpp',raw(role,'true','true'));z.writestr(role+'-yes.kpp',raw(role,'yes','no',pt='string',ut='string'))
                z.writestr('neighbor.kpp',raw('Flow','yes','no',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),5)
            d={Path(x['source']).stem:x['descriptor'] for x in c.brushes}
            for role in ('Opacity','Flow'):self.assertEqual(normalized(d[role+'-true']),normalized(d[role+'-yes']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy(self):
        from test_krita import kpp
        for role in ('Opacity','Flow'):
            results={}
            for value in ('true','yes','no'):
                fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="string">'+value+'</param><param name="MaskingBrush/Preset/'+role+'UseCurve">'+value+'</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=converted(kpp(resources=fields),Path(tmp));self.assertEqual(c.skipped,[]);results[value]=normalized(c.brushes[0]['descriptor'])
            self.assertEqual(results['true'],results['yes']);self.assertEqual(results['true'],results['no'])
            if results['true']['version']==27:self.assertEqual(results['true']['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
    def test_public_malformed_duplicate(self):
        for role in ('Opacity','Flow'):
            root=ET.fromstring(Image.open(io.BytesIO(raw(role,'yes','no'))).text['preset'])
            n=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+role+'UseCurve');n.set('type','bytearray');n.text='%%%'
            with tempfile.TemporaryDirectory() as tmp:
                c=converted(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
            root=ET.fromstring(Image.open(io.BytesIO(raw(role,'yes','no'))).text['preset']);ET.SubElement(root,'param',name='PaintOpAction').text='2'
            with tempfile.TemporaryDirectory() as tmp:
                c=converted(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
