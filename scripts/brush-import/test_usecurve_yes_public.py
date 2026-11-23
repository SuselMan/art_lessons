"""Public-input witnesses for the narrow UseCurve=yes guard."""
import base64
import io
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, PngImagePlugin
from convert import Catalog
from krita_import import convert_krita, preset, _SOURCE_SCOPE
from test_krita_size_strength import authored
from test_sketch_spray194 import native194
from test_child_clock132 import params132, resources132


def typed(raw, name, value):
    image=Image.open(io.BytesIO(raw));image.load();root=ET.fromstring(image.info['preset'])
    node=next((p for p in root.findall('param') if p.get('name')==name),None)
    if node is None: node=ET.SubElement(root,'param',name=name)
    node.set('type','bytearray');node.text=base64.b64encode(value).decode('ascii')
    info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'))
    out=io.BytesIO();image.save(out,format='PNG',pnginfo=info);return out.getvalue()

class UseCurveYesPublic(unittest.TestCase):
    def load(self, raw, resources=None, bundle=False):
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            root=Path(tmp);path=root/('pair.bundle' if bundle else 'input.kpp')
            if bundle:
                with ZipFile(path,'w') as z:
                    z.writestr('bad.kpp',raw);z.writestr('good.kpp',authored({'PressureSize':'true','SizeUseCurve':'true'}))
            else:path.write_bytes(raw)
            catalog=Catalog(root/'out');convert_krita(path,catalog,resources or {})
            return catalog.brushes,catalog.skipped

    def test_active_root_options(self):
        for option in ('Size','Opacity','Flow'):
            for check in ('true','false',None):
                for curve in ('yes','true','false',''):
                    params={option+'UseCurve':curve,option+'Sensor':'<params id="pressure"/>'}
                    if check is not None:params['Pressure'+option]=check
                    active=option!='Size' or check=='true'
                    for bundle in (False,True):
                        with self.subTest(option=option,check=check,curve=curve,bundle=bundle):
                            brushes,skipped=self.load(authored(params),bundle=bundle)
                            if active and curve=='yes':
                                self.assertIn('Unsupported noncanonical '+option+'UseCurve',str(skipped));self.assertEqual(len(brushes),int(bundle))
                            else:self.assertEqual(skipped,[])

    def test_sketch_and_typed_checked_flags(self):
        for check in ('true','false',''):
            raw=native194(params={'PressureLine width':check,'Line widthUseCurve':'yes','Line widthSensor':'<params id="pressure"/>'})
            brushes,skipped=self.load(raw)
            if check=='true':self.assertIn('Unsupported noncanonical Line widthUseCurve',str(skipped))
            else:self.assertEqual(skipped,[])
        raw=typed(authored({'PressureSize':'true','SizeUseCurve':'yes'}),'PressureSize',b'yes')
        self.assertIn('Unsupported noncanonical SizeUseCurve',str(self.load(raw)[1]))
        raw=typed(authored({'PressureSize':'true','SizeUseCurve':'yes'}),'PressureSize',b'false')
        self.assertEqual(self.load(raw)[1],[])
        raw=typed(authored({'PressureSize':'true','SizeUseCurve':'true'}),'SizeUseCurve',b'yes')
        self.assertIn('Unsupported noncanonical SizeUseCurve',str(self.load(raw)[1]))
        raw=typed(authored({'PressureSize':'true','SizeUseCurve':'true'}),'SizeUseCurve',b'false')
        self.assertEqual(self.load(raw)[1],[])

    def test_mask_action_and_disabled(self):
        for action in (None,'1','2','0','3','02'):
            for mask in (None,'false','true'):
                params={**params132(),'MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeUseCurve':'yes'}
                if action is None:params.pop('PaintOpAction',None)
                else:params['PaintOpAction']=action
                if mask is None:params.pop('MaskingBrush/Enabled',None)
                else:params['MaskingBrush/Enabled']=mask
                brushes,skipped=self.load(authored(params),resources132())
                if mask=='true' and action not in (None,'1'):
                    self.assertIn('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve',str(skipped))
                else:self.assertNotIn('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve',str(skipped))
        raw=authored({**params132(),'MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeUseCurve':'yes'})
        for action,expected in ((b'1',False),(b'2',True)):
            self.assertEqual('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve' in str(self.load(typed(raw,'PaintOpAction',action),resources132())[1]),expected)
        for mask,expected in ((b'false',False),(b'0',False),(b'',False),(b'true',True)):
            result=self.load(typed(raw,'MaskingBrush/Enabled',mask),resources132())[1]
            # Existing public mask guard may report typed enabled earlier/later.
            if expected:self.assertTrue(result)
            else:self.assertNotIn('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve',str(result))

    def test_private_adapter_and_malformed_typed_values(self):
        raw=authored({'PressureSize':'true','SizeUseCurve':'yes'})
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            result=preset(raw,'private.kpp',Catalog(Path(tmp)/'out'),{},_adapter_private=True)
            self.assertIsNotNone(result['descriptor'])
            self.assertIsNone(_SOURCE_SCOPE.get())
        # Qt accepts some malformed base64; the guard deliberately fails closed.
        raw=typed(raw,'PressureSize',b'true')
        image=Image.open(io.BytesIO(raw));image.load();root=ET.fromstring(image.info['preset'])
        next(p for p in root.findall('param') if p.get('name')=='PressureSize').text='dHJ1ZQ==!'
        info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'))
        output=io.BytesIO();image.save(output,format='PNG',pnginfo=info)
        for bundle in (False,True):
            brushes,skipped=self.load(output.getvalue(),bundle=bundle)
            self.assertIn('Unsupported malformed typed PressureSize',str(skipped))
            self.assertEqual(len(brushes),int(bundle))

    def test_other_qt_true_values_and_confirmed_consumers(self):
        for engine in ('paintbrush','sketchbrush','spraybrush','deformbrush','colorsmudge','duplicate','tangentnormal'):
            for value in ('yes','no',' true ','00'):
                for bundle in (False,True):
                    params={'OpacityUseCurve':value,'OpacitySensor':'<params id="pressure"/>'}
                    raw=authored(params) if engine=='paintbrush' else native194(engine,params=params)
                    with self.subTest(engine=engine,value=value,bundle=bundle):
                        brushes,skipped=self.load(raw,bundle=bundle)
                        self.assertIn('Unsupported noncanonical OpacityUseCurve',str(skipped))
                        self.assertEqual(len(brushes),int(bundle))
        for curve in ('yes','no','00'):
            for checked in ('true','false'):
                raw=authored({'PressureScatter':checked,'ScatterUseCurve':curve})
                brushes,skipped=self.load(raw)
                if checked=='true':self.assertIn('Unsupported noncanonical ScatterUseCurve',str(skipped))
                else:self.assertNotIn('Unsupported noncanonical ScatterUseCurve',str(skipped))
        for value in (b'true',b'1',b'false',b'0',b''):
            raw=typed(authored({'OpacityUseCurve':'true'}),'OpacityUseCurve',value)
            for bundle in (False,True):
                brushes,result=self.load(raw,bundle=bundle)
                self.assertEqual(result,[])
                self.assertEqual(len(brushes),1+int(bundle))
        for action in ('1','2'):
            for value in ('no','false'):
                raw=authored({**params132(),'PaintOpAction':action,
                    'MaskingBrush/Preset/PressureSize':'true',
                    'MaskingBrush/Preset/SizeUseCurve':value})
                for bundle in (False,True):
                    result=self.load(raw,resources132(),bundle=bundle)[1]
                    expected=action=='2' and value=='no'
                    self.assertEqual('Unsupported noncanonical MaskingBrush/Preset/SizeUseCurve' in str(result),expected)

    def test_checked_size_in_other_native_consumers(self):
        for engine in ('sketchbrush','spraybrush','deformbrush','colorsmudge','tangentnormal'):
            for checked in ('true','false',None):
                for value in ('yes','no','true','false'):
                    params={'SizeUseCurve':value,'SizeSensor':'<params id="pressure"/>'}
                    if checked is not None:params['PressureSize']=checked
                    raw=native194(engine,params=params)
                    for bundle in (False,True):
                        with self.subTest(engine=engine,checked=checked,value=value,bundle=bundle):
                            brushes,skipped=self.load(raw,bundle=bundle)
                            hit='Unsupported noncanonical SizeUseCurve' in str(skipped)
                            self.assertEqual(hit,checked=='true' and value in ('yes','no'))
                            if hit:self.assertEqual(len(brushes),int(bundle))

    def test_canonical_typed_true_keeps_pressure_curve(self):
        for option in ('Size','Opacity','Flow'):
            raw=typed(authored({'Pressure'+option:'true',option+'UseCurve':'true'}),option+'UseCurve',b'true')
            for bundle in (False,True):
                brushes,skipped=self.load(raw,bundle=bundle)
                self.assertEqual(skipped,[])
                self.assertEqual(brushes[0]['descriptor'][option.lower()+'ByPressure'],[[0,0],[1,1]])

if __name__=='__main__':unittest.main()
