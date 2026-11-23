import base64,copy,io,tempfile,unittest,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,_qt_guard_text
from native_mask190 import png_preset
from test_child_opacity_flow_mixed import mixed
from test_child_sensor_qt_bool import fixture as sensor
from test_child_size_usecurve_qt_bool import fixture as size,convert
from test_child_rotation_usecurve_qt_bool import normalized
from test_child_clock132 import resources132

ROLES=('Opacity','Flow','Size','Rotation','Ratio','Mirror','Scatter')
def raw(role,value,spaced=False,mask=True,timer=False):
    if role in ('Opacity','Flow'):data=mixed(role,value,'yes',timer=timer,mask=mask)
    elif role=='Size':data=size('true',mask=mask,timer=timer)
    else:data=sensor(role,value,mask=mask,curve=True,timer=timer)
    root=ET.fromstring(Image.open(io.BytesIO(data)).text['preset']);name='MaskingBrush/Preset/Pressure'+role
    node=next((p for p in root.findall('param') if p.get('name')==name),None)
    if node is None:node=ET.SubElement(root,'param',name=name)
    node.set('type','bytearray');enc=base64.b64encode(value.encode()).decode();node.text=(' '+enc[:2]+' \n'+enc[2:]+' ') if spaced else enc
    return png_preset(root)

class GuardWhitespace(unittest.TestCase):
    def test_active_inactive_timer(self):
        for role in ROLES:
            for value in ('true','false','yes','no'):
                for mask,timer in ((True,False),(True,True),(False,False)):
                    with self.subTest(role=role,value=value,mask=mask,timer=timer),tempfile.TemporaryDirectory() as tmp:
                        out=[]
                        for spaced in (False,True):
                            data=raw(role,value,spaced,mask,timer);c=convert(data,Path(tmp))
                            if c.skipped:out.append(('skip',c.skipped[0]['reasons']))
                            else:
                                d=c.brushes[0]['descriptor'];self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),data)['id'])
                                out.append(('ok',normalized(d) if mask else {k:v for k,v in d.items() if k!='id'}))
                        self.assertEqual(out[0],out[1])
                        if role=='Size' and mask and value in ('yes','no'):self.assertEqual(out[0][0],'skip')
    def test_strict_and_public_duplicate(self):
        root=ET.fromstring(Image.open(io.BytesIO(raw('Opacity','yes',True))).text['preset']);node=next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/PressureOpacity');self.assertEqual(_qt_guard_text(node),'yes')
        node.text=' eW !Vz '
        with self.assertRaises(ValueError):_qt_guard_text(node)
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
        root=ET.fromstring(Image.open(io.BytesIO(raw('Opacity','yes',True))).text['preset']);ET.SubElement(root,'param',name='PaintOpAction').text='2'
        with tempfile.TemporaryDirectory() as tmp:
            c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
    def test_bundle(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'x.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for role in ('Opacity','Flow','Rotation','Ratio','Mirror','Scatter'):
                    z.writestr(role+'-plain.kpp',raw(role,'yes'));z.writestr(role+'-space.kpp',raw(role,'yes',True))
                z.writestr('neighbor.kpp',raw('Opacity','yes',True,False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),13)
            d={Path(x['source']).stem:x['descriptor'] for x in c.brushes}
            for role in ('Opacity','Flow','Rotation','Ratio','Mirror','Scatter'):self.assertEqual(normalized(d[role+'-plain']),normalized(d[role+'-space']))
            self.assertNotIn('dual',d['neighbor']['behavior'])
    def test_legacy(self):
        from test_krita import kpp
        for role in ROLES:
            results=[]
            for spaced in (False,True):
                encoded=' eW \nVz ' if spaced else 'eWVz'
                fields=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'" type="bytearray">'+encoded+'</param><param name="MaskingBrush/Preset/'+role+'UseCurve">true</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(kpp(resources=fields),Path(tmp));results.append(('skip',c.skipped[0]['reasons']) if c.skipped else ('ok',normalized(c.brushes[0]['descriptor'])))
            self.assertEqual(results[0],results[1],role)
            if results[0][0]=='ok' and results[0][1]['version']==27:self.assertEqual(results[0][1]['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
    def test_root_pressure_guard_preserves_explicit_refusal(self):
        from test_krita import kpp
        for text in ('eWVz',' eW Vz '):
            fields='<param name="PressureSize" type="bytearray">'+text+'</param><param name="SizeUseCurve">true</param><param name="SizeSensor"><![CDATA[<params id="pressure"/>]]></param>'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(kpp(resources=fields),Path(tmp));self.assertEqual(len(c.skipped),1);self.assertIn('Unsupported noncanonical PressureSize',c.skipped[0]['reasons'][0])
