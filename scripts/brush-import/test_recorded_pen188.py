import unittest,tempfile,io,json,base64,copy
from pathlib import Path
from PIL import Image,PngImagePlugin
from xml.etree import ElementTree as ET
import convert
from krita_import import convert_krita
from recorded_pen188 import recorded_pen188_scope

def authored(option,sensor,extra=None):
 p={'PaintOpAction':'1','CompositeOp':'normal','PressureSize':'false','PressureRotation':'false','PressureOpacity':'false','brush_definition':'<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio="1" diameter="4"/></Brush>','Pressure'+option:'true',option+'UseCurve':'true',option+'UseSameCurve':'true',option+'commonCurve':'0,0;1,1;',option+'Value':'.5',option+'Sensor':sensor,**(extra or{})};root=ET.Element('Preset',name='Own188',paintopid='paintbrush',version='5.0')
 for k,v in p.items():ET.SubElement(root,'param',name=k,type='bool'if v in('true','false')else'string').text=v
 meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();Image.new('RGBA',(2,2),(255,255,255,255)).save(out,format='PNG',pnginfo=meta);return out.getvalue()
class RecordedPen188Tests(unittest.TestCase):
 def convert(self,tmp,option='Size',sensor='<params id="rotation"/>',extra=None):
  f=Path(tmp)/'Own188.kpp';f.write_bytes(authored(option,sensor,extra));c=convert.Catalog(Path(tmp)/'native');convert_krita(f,c);return c
 def test_native_three_targets_both_sensor_domains_and_curve_constant_preserved(self):
  for option in('Size','Opacity','Rotation'):
   for sensor in('rotation','tangentialpressure'):
    with self.subTest(option=option,sensor=sensor),tempfile.TemporaryDirectory()as tmp:
     c=self.convert(tmp,option,'<params id="'+sensor+'"/>');self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],188);self.assertTrue(recorded_pen188_scope(d))
     if option=='Rotation':self.assertEqual(d['behavior']['rotation']['composition']['strength'],.5)
     elif sensor=='rotation':self.assertEqual(d['behavior']['modulations'][option.lower()][0]['combine']['constant'],.5)
 def test_portable_whole_equality_and_new_scope_preoutput_negatives(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.convert(tmp);lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}};f=Path(tmp)/'x.grafetto-brushes.json';f.write_text(json.dumps(env));out=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(f,out);self.assertEqual(out.brushes,c.brushes)
   for i,change in enumerate([lambda d:d.update(version=187),lambda d:d.update(filter={'kind':'invert'}),lambda d:d['behavior']['modulations'].update(flow=d['behavior']['modulations']['size']),lambda d:d['behavior']['modulations']['size'][0]['combine']['additive'][0].update(control='tangentialPressure')]):
    bad=copy.deepcopy(env);change(bad['library']['brushes'][0]['descriptor']);f.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(f,out)
    self.assertEqual(list(out.output.iterdir()),[])
 def test_other_targets_child_and_native_active_unsafe_flags_declined(self):
  for option,extra in[('Flow',{}),('Size',{'MaskingBrush/Enabled':'true'}),('Size',{'PaintOpSettings/isAirbrushing':'true'}),('Size',{'PaintOpAction':'2'})]:
   with self.subTest(option=option,extra=extra),tempfile.TemporaryDirectory()as tmp:self.assertTrue(self.convert(tmp,option,extra=extra).skipped)

 def test_native_pressure_companion_and_nonidentity_curve_are_not_silently_dropped(self):
  sensor='<params id="sensorslist"><ChildSensor id="rotation"/><ChildSensor id="pressure"/></params>'
  with tempfile.TemporaryDirectory()as tmp:
   c=self.convert(tmp,'Size',sensor,{'SizecommonCurve':'0,1;1,0;'});self.assertEqual(c.skipped,[]);expr=c.brushes[0]['descriptor']['behavior']['modulations']['size'][0]['combine'];self.assertEqual(expr['constant'],.5);self.assertEqual([v['control']for v in expr['scaling']],['pressure']);self.assertEqual([v['control']for v in expr['additive']],['barrelRotation']);self.assertEqual(expr['additive'][0]['curve']['kind'],'uniform');self.assertGreater(expr['additive'][0]['curve']['samples'][0],expr['additive'][0]['curve']['samples'][-1])
