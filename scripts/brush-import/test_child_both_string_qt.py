import copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,_child_mixed_qt_wash
from native_mask190 import png_preset
from test_child_mixed_qt_bool import mixed,ROLES
from test_child_size_usecurve_qt_bool import convert,fixture
from test_child_typed_action_qt import typed
from test_child_rotation_usecurve_qt_bool import normalized
from test_child_clock132 import resources132

def raw(role,checked,curve,checked_string,curve_string,timer=False,action=False):
    data=mixed(role,checked,curve,False,False,timer)
    if action:data=typed(data,' M g== ')
    root=ET.fromstring(Image.open(io.BytesIO(data)).text['preset'])
    for name,explicit in [('Pressure'+role,checked_string),(role+'UseCurve',curve_string)]:
        if explicit:next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+name).set('type','string')
    return png_preset(root)

class BothString(unittest.TestCase):
    def test_full_descriptors(self):
        for role in ROLES:
            for timer in (False,True):
                for action in (False,True):
                    for checked,curve in [('yes','no'),('no','yes'),('true','yes'),('yes','true'),('no','false'),('false','yes')]:
                        canonical_checked='true' if checked in ('yes','no') else checked
                        canonical_curve='true' if curve in ('yes','no') else curve
                        reference=raw(role,canonical_checked,canonical_curve,False,False,timer,action)
                        for ct,ut in ((False,False),(True,False),(False,True),(True,True)):
                            with self.subTest(role=role,timer=timer,action=action,checked=checked,curve=curve,ct=ct,ut=ut),tempfile.TemporaryDirectory() as tmp:
                                results=[]
                                for data in (reference,raw(role,checked,curve,ct,ut,timer,action)):
                                    c=convert(data,Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),data)['id']);results.append(normalized(d))
                                self.assertEqual(results[0],results[1])
    def test_guards(self):
        for role in ROLES:
            root=ET.fromstring(Image.open(io.BytesIO(raw(role,'yes','no',True,False))).text['preset']);self.assertEqual(_child_mixed_qt_wash(root,role),('true','true'))
            for name,value,typ in [('PaintOpAction','3',None),('MaskingBrush/Enabled','false',None),('MaskingBrush/Preset/Pressure'+role,'false','string'),('MaskingBrush/Preset/'+role+'UseCurve','%%%','bytearray')]:
                changed=copy.deepcopy(root);node=next(p for p in changed.findall('param') if p.get('name')==name);node.text=value
                if typ:node.set('type',typ)
                else:node.attrib.pop('type',None)
                self.assertIsNone(_child_mixed_qt_wash(changed,role))
            changed=copy.deepcopy(root);ET.SubElement(changed,'param',name='PaintOpAction').text='2';self.assertIsNone(_child_mixed_qt_wash(changed,role))
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'cases.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ROLES:
                    z.writestr(role+'-true.kpp',raw(role,'true','true',False,False));z.writestr(role+'-yes.kpp',raw(role,'yes','no',True,True))
                z.writestr('neighbor.kpp',fixture('true',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),9)
            d={Path(x['source']).stem:x['descriptor'] for x in c.brushes}
            for role in ROLES:self.assertEqual(normalized(d[role+'-true']),normalized(d[role+'-yes']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy(self):
        from test_krita import kpp
        for role in ROLES:
            results={}
            for value in ('true','yes'):
                fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="string">'+value+'</param><param name="MaskingBrush/Preset/'+role+'UseCurve">'+value+'</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(kpp(resources=fields),Path(tmp));self.assertEqual(c.skipped,[]);results[value]=normalized(c.brushes[0]['descriptor'])
            self.assertEqual(results['true'],results['yes'])
            if results['true']['version']==27:self.assertEqual(results['true']['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
    def test_public_inactive_and_duplicate(self):
        for role in ROLES:
            data=raw(role,'yes','no',True,True);root=ET.fromstring(Image.open(io.BytesIO(data)).text['preset']);next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Enabled').text='false'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(png_preset(root),Path(tmp));self.assertEqual(c.skipped,[]);self.assertNotIn('dual',c.brushes[0]['descriptor']['behavior'])
            root=ET.fromstring(Image.open(io.BytesIO(data)).text['preset']);ET.SubElement(root,'param',name='PaintOpAction').text='2'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
