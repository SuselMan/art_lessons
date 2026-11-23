import base64, copy, io, tempfile, unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from native_mask190 import png_preset
from test_child_size_usecurve_qt_bool import fixture as base_fixture, convert

def fixture(value, timer=False, checked='true'):
    root=ET.fromstring(Image.open(io.BytesIO(base_fixture('true',timer=timer))).text['preset'])
    for name,value in [('PressureSize','false'),('PressureRotation',checked),('RotationSensor','<params id="pressure"><curve>0,0;1,1;</curve></params>'),('RotationUseCurve',value)]:
        name='MaskingBrush/Preset/'+name
        node=next((p for p in root.findall('param') if p.get('name')==name),None)
        if node is None: node=ET.SubElement(root,'param',name=name)
        node.text=value
        if name.endswith('RotationUseCurve'):node.set('type','bytearray');node.text=base64.b64encode(value.encode()).decode()
    return png_preset(root)

def normalized(d):
    d=copy.deepcopy(d);d.pop('id');d['behavior']['dual']['brush'].pop('id');return d

class TestChildRotation(unittest.TestCase):
    def test_active(self):
        for timer in (False,True):
            results={}
            for value in ('true','false','yes','no'):
                with self.subTest(timer=timer,value=value),tempfile.TemporaryDirectory() as tmp:
                    c=convert(fixture(value,timer),Path(tmp));self.assertEqual(c.skipped,[])
                    d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],195 if timer else 190)
                    from brush_contract import finalize_identity
                    self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),fixture(value,timer))['id'])
                    results[value]=normalized(d)
            self.assertEqual(results['true'],results['yes']);self.assertEqual(results['true'],results['no'])
            self.assertNotEqual(results['true'],results['false'])
    def test_inactive(self):
        results=[]
        for value in ('true','yes','no'):
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(fixture(value,checked='false'),Path(tmp));self.assertEqual(c.skipped,[]);results.append(normalized(c.brushes[0]['descriptor']))
        self.assertEqual(results[0],results[1]);self.assertEqual(results[0],results[2])

class TestBoundary(unittest.TestCase):
    def test_legacy_full_descriptor(self):
        from test_krita import kpp
        values={}
        for v in ('true','yes','no'):
            field=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/PressureRotation">true</param><param name="MaskingBrush/Preset/RotationUseCurve" type="bytearray">'+base64.b64encode(v.encode()).decode()+'</param><param name="MaskingBrush/Preset/RotationSensor"><![CDATA[<params id="pressure"/>]]></param>')
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(kpp(resources=field),Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],27);values[v]=normalized(d)
        self.assertEqual(values['true'],values['yes']);self.assertEqual(values['true'],values['no'])
        self.assertEqual(values['true']['behavior']['dual']['brush']['behavior']['rendering']['accumulation'],'alphaDarken')
    def test_invalid_and_unrelated_guard(self):
        for name,text,typ in [('MaskingBrush/Preset/RotationUseCurve','%%%','bytearray'),('SizeUseCurve','yes',None)]:
            root=ET.fromstring(Image.open(io.BytesIO(fixture('yes'))).text['preset'])
            node=next((p for p in root.findall('param') if p.get('name')==name),None)
            if node is None:node=ET.SubElement(root,'param',name=name)
            node.text=text
            if typ:node.set('type',typ)
            if name=='SizeUseCurve':
                checked=next((p for p in root.findall('param') if p.get('name')=='PressureSize'),None)
                if checked is None:checked=ET.SubElement(root,'param',name='PressureSize')
                checked.text='true'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)
    def test_bundle(self):
        import zipfile
        from brush_contract import Catalog
        from krita_import import convert_krita
        from test_child_clock132 import resources132
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'cases.bundle'
            with zipfile.ZipFile(p,'w') as z:
                for v in ('true','false','yes','no'):z.writestr(v+'.kpp',fixture(v))
                z.writestr('neighbor.kpp',base_fixture('true',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),5)
            d={Path(x['source']).stem:x['descriptor'] for x in c.brushes}
            self.assertEqual(normalized(d['true']),normalized(d['yes']));self.assertEqual(normalized(d['true']),normalized(d['no']))
            self.assertNotIn('dual',d['neighbor']['behavior'])

class TestOtherChildCurves(unittest.TestCase):
    def make(self,role,value,timer,checked):
        root=ET.fromstring(Image.open(io.BytesIO(fixture('true',timer))).text['preset'])
        for name,val in [('PressureRotation','false'),('Pressure'+role,checked),(role+'UseCurve',base64.b64encode(value.encode()).decode()),(role+'Sensor','<params id="pressure"/>'),('HorizontalMirrorEnabled','true'),('ScatterValue','.5')]:
            key='MaskingBrush/Preset/'+name
            node=next((p for p in root.findall('param') if p.get('name')==key),None)
            if node is None:node=ET.SubElement(root,'param',name=key)
            node.text=val
            if name==role+'UseCurve':node.set('type','bytearray')
        return png_preset(root)
    def test_active_and_inactive_timer(self):
        for role in ('Ratio','Mirror','Scatter'):
            for timer in (False,True):
                for checked in ('true','false'):
                    results={}
                    for value in ('true','false','yes','no'):
                        with self.subTest(role=role,timer=timer,checked=checked,value=value),tempfile.TemporaryDirectory() as tmp:
                            c=convert(self.make(role,value,timer,checked),Path(tmp));self.assertEqual(c.skipped,[])
                            d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],195 if timer else 190);results[value]=normalized(d)
                    self.assertEqual(results['true'],results['yes']);self.assertEqual(results['true'],results['no'])
                    if checked=='true':self.assertNotEqual(results['true'],results['false'])
                    else:self.assertEqual(results['true'],results['false'])
    def test_legacy_candidate(self):
        from test_krita import kpp
        for role in ('Ratio','Mirror','Scatter'):
            values={}
            for v in ('true','yes','no'):
                field=('<param name="PaintOpAction">2</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/UseMasterSize">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" id="default" diameter="16" ratio="1" hfade="1" vfade="1" spikes="2"/></Brush>]]></param><param name="MaskingBrush/Preset/Pressure'+role+'">true</param><param name="MaskingBrush/Preset/'+role+'UseCurve" type="bytearray">'+base64.b64encode(v.encode()).decode()+'</param><param name="MaskingBrush/Preset/'+role+'Sensor"><![CDATA[<params id="pressure"/>]]></param><param name="MaskingBrush/Preset/HorizontalMirrorEnabled">true</param><param name="MaskingBrush/Preset/ScatterValue">.5</param>')
                with tempfile.TemporaryDirectory() as tmp:
                    c=convert(kpp(resources=field),Path(tmp));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];values[v]=normalized(d)
            self.assertEqual(values['true'],values['yes']);self.assertEqual(values['true'],values['no'])
    def test_bundle_and_malformed(self):
        import zipfile
        from brush_contract import Catalog,finalize_identity
        from krita_import import convert_krita
        from test_child_clock132 import resources132
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'cases.bundle';raws={}
            with zipfile.ZipFile(p,'w') as z:
                for role in ('Ratio','Mirror','Scatter'):
                    for v in ('true','yes','no'):
                        name=role+'-'+v;raws[name]=self.make(role,v,False,'true');z.writestr(name+'.kpp',raws[name])
                z.writestr('neighbor.kpp',base_fixture('true',mask=False))
                for name,data in resources132().items():z.writestr('brushes/'+name,data)
            c=Catalog(Path(tmp)/'out');convert_krita(p,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),10)
            d={Path(x['source']).stem:x['descriptor'] for x in c.brushes}
            for role in ('Ratio','Mirror','Scatter'):
                for v in ('yes','no'):self.assertEqual(normalized(d[role+'-true']),normalized(d[role+'-'+v]))
                for v in ('true','yes','no'):
                    name=role+'-'+v;self.assertEqual(d[name]['id'],finalize_identity(copy.deepcopy(d[name]),raws[name])['id'])
            self.assertNotIn('dual',d['neighbor']['behavior'])
        for role in ('Ratio','Mirror','Scatter'):
            root=ET.fromstring(Image.open(io.BytesIO(self.make(role,'yes',False,'true'))).text['preset'])
            next(p for p in root.findall('param') if p.get('name')=='MaskingBrush/Preset/'+role+'UseCurve').text='%%%'
            with tempfile.TemporaryDirectory() as tmp:
                c=convert(png_preset(root),Path(tmp));self.assertEqual(len(c.skipped),1)

class TestScope(unittest.TestCase):
    def test_only_public_literal_wash_active_and_strict_base64(self):
        from krita_import import _child_curve_bytearray_wash
        for role in ('Rotation','Ratio','Mirror','Scatter'):
            original=ET.fromstring(Image.open(io.BytesIO(TestOtherChildCurves().make(role,'yes',False,'true'))).text['preset'])
            self.assertTrue(_child_curve_bytearray_wash(original,role))
            for key,value,typ in [('PaintOpAction','1',None),('MaskingBrush/Enabled','false',None),('MaskingBrush/Preset/Pressure'+role,'false',None),('MaskingBrush/Preset/'+role+'UseCurve','%%%','bytearray')]:
                root=copy.deepcopy(original);node=next(p for p in root.findall('param') if p.get('name')==key)
                node.text=value
                if typ:node.set('type',typ)
                self.assertFalse(_child_curve_bytearray_wash(root,role),(role,key))
            root=copy.deepcopy(original);ET.SubElement(root,'param',name='PaintOpAction').text='2'
            self.assertFalse(_child_curve_bytearray_wash(root,role))

if __name__ == "__main__": unittest.main()
