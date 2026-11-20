import unittest,tempfile,json,copy,subprocess
from pathlib import Path
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
PIN='c2a38084b68cdc8f9956fac440af7948db3e9253'
class SketchProcedural173Tests(unittest.TestCase):
 def make(self,root,shape='rect',extra='',attrs=''):
  definition='<Brush type="auto_brush" density="1" randomness="0"><MaskGenerator id="default" type="'+shape+'" diameter="16" ratio=".5" hfade="1" vfade="1" spikes="2" antialiasEdges="1" '+attrs+'/></Brush>'
  raw=kpp(definition,engine='sketchbrush',resources='<param name="PressureSize">true</param>'+extra);c=Catalog(root);b=preset(raw,'own173.kpp',c,{});c.brushes.append(b);return raw,b,c
 def test_native_shapes_pressure_and_portable_full_record(self):
  for shape in['rect','circle']:
   with tempfile.TemporaryDirectory()as tmp:
    raw,b,c=self.make(Path(tmp)/'in',shape);d=b['descriptor'];self.assertEqual(d['version'],173);self.assertEqual(d['sketch']['maskSignal'],'procedural-standard-v1');self.assertEqual(d['tip']['aspect'],2);self.assertEqual(d['tip']['profile']['shape'],'rectangle'if shape=='rect'else'ellipse');self.assertEqual(c.assets,{});self.assertEqual(b['sourceDefaults']['sizePx'],16);self.assertEqual(d['sizeByPressure']['samples'][0],0);self.assertEqual(d['sizeByPressure']['samples'][-1],1);self.assertLess(d['sizeByPressure']['samples'][128],.25)
    env={'library':c.write(),'assets':{}};p=Path(tmp)/'portable.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'out');portable_bundle(p,out);self.assertEqual(out.brushes,[b]);self.assertFalse(out.assets)
    for kind in['version','marker','profile','timer','erase','random','size','shapeArray','controlArray','path','travel']:
     bad=copy.deepcopy(env);x=bad['library']['brushes'][0]['descriptor']
     if kind=='version':x['version']=172
     elif kind=='marker':x['sketch']['maskSignal']='unknown'
     elif kind=='profile':x['tip']['profile']['kind']='gaussian'
     elif kind=='timer':x['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
     elif kind=='erase':x['behavior']['erase']=True
     elif kind=='random':x['behavior']['modulations']={'size':[{'control':'random','minimum':0,'jitter':0}]}
     elif kind=='shapeArray':x['tip']['profile']['shape']=['ellipse']
     elif kind=='controlArray':x['behavior']['modulations']={'size':[{'control':['pressure'],'minimum':0,'jitter':0}]}
     elif kind in('path','travel'):x['tip']['rotation']=kind
     else:x['sketch']['maskSize']=[16,8]
     p.write_text(json.dumps(bad));o=Catalog(Path(tmp)/('bad'+kind))
     with self.subTest(kind=kind),self.assertRaises(ValueError):portable_bundle(p,o)
     self.assertFalse(o.brushes);self.assertFalse(o.assets);self.assertEqual(list(o.output.iterdir()),[])
 def test_native_pressure_rotation_is_existing_composition(self):
  extra='<param name="PressureRotation">true</param><param name="RotationUseCurve">true</param><param name="RotationValue">.25</param><param name="RotationSensor"><![CDATA[<params id="pressure"><curve>0,0;1,1;</curve></params>]]></param>'
  with tempfile.TemporaryDirectory()as tmp:
   _,b,_=self.make(Path(tmp),extra=extra);q=b['descriptor']['behavior']['rotation'];self.assertEqual(q['follow'],0);self.assertEqual(q['random'],'none');self.assertEqual(q['composition']['strength'],.25);self.assertEqual(q['composition']['scaling'][0]['control'],'pressure')
 def test_native_nonclosed_options_reject(self):
  for extra in['<param name="PaintOpSettings/isAirbrushing">true</param>','<param name="AirbrushOption/isAirbrushing">true</param>','<param name="PaintOpAction">2</param>','<param name="Krita/erase">true</param>','<param name="PressureSoftness">true</param>']:
   with tempfile.TemporaryDirectory()as tmp,self.subTest(extra=extra),self.assertRaises(ValueError):self.make(Path(tmp),extra=extra)
 def test_old_simple_whole_record_unchanged(self):
  ns={'__name__':'old'};exec(compile(subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_sketch.py']),'old.py','exec'),ns)
  # Existing simple branch bypasses the new selector and original bytes stay authority.
  import io
  from PIL import Image
  import xml.etree.ElementTree as ET
  from krita_import import xml
  raw=kpp(engine='sketchbrush',resources='<param name="Sketch/simpleMode">true</param>');im=Image.open(io.BytesIO(raw));root=ET.fromstring(im.info['preset']);params={n.get('name'):n.text for n in root.findall('param')}
  with tempfile.TemporaryDirectory()as tmp:
   a=preset(raw,'old.kpp',Catalog(Path(tmp)/'a'),{});old=ns['sketch_preset'](raw,root,params,'old.kpp',Catalog(Path(tmp)/'b'),{},lambda x:None);self.assertEqual(a,old)
 def test_old101_114_162_whole_records_equal_pinned_adapter(self):
  import test_sketch_image_alpha162 as fixture,io,xml.etree.ElementTree as ET
  from PIL import Image
  ns={'__name__':'old'};exec(compile(subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_sketch.py']),'old.py','exec'),ns)
  f=fixture.SketchImageAlpha162Tests();f.setUp()
  try:
   for application,extra in[(0,''),(0,'<param name="Sketch/distanceOpacity">true</param>'),(1,'')]:
    captured={};real=fixture.preset
    def record(raw,name,catalog,external):captured.update(raw=raw,name=name,external=external);return real(raw,name,catalog,external)
    fixture.preset=record
    try:actual,_,_=f.make(application=application,extra=extra)
    finally:fixture.preset=real
    raw=captured['raw'];im=Image.open(io.BytesIO(raw));root=ET.fromstring(im.info['preset']);params={n.get('name'):n.text for n in root.findall('param')}
    c=Catalog(f.root/('old'+str(application)+str(len(extra))));old=ns['sketch_preset'](raw,root,params,captured['name'],c,captured['external'],lambda x:captured['external'][x]);self.assertEqual(actual,old)
  finally:f.tearDown()
if __name__=='__main__':unittest.main()
