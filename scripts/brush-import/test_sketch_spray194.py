"""Authored genuine native inputs, whole portable/CAS checks; no renderer mocks."""
import base64,copy,io,json,struct,tempfile,unittest,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from native_mask190 import png_preset
from brush_contract import Catalog
from krita_import import preset
from sketch_spray194 import scope194,NATIVE_MODES,validate194_portable
import convert

def native194(engine='sketchbrush',tip=None,params=None):
 values={'CompositeOp':'normal','PaintOpAction':'1','SizeUseCurve':'false','PressureSize':'false','Sketch/simpleMode':'false','Sketch/probability':'1','Spray/diameter':'40','Spray/scale':'1','Spray/aspect':'1','Spray/spacing':'.5','Spray/particleCount':'7','SprayShape/enabled':'false','ShapeDynamicsVersion':'2.3','ShapeDynamics/enabled':'true','ShapeDynamics/randomSize':'true'}
 values.update(params or{});values['brush_definition']=tip or'<Brush type="auto_brush" spacing=".1" density=".7" randomness=".2"><MaskGenerator id="default" type="circle" diameter="16" ratio=".6" hfade=".4" vfade=".7" spikes="5" antialiasEdges="1"/></Brush>'
 root=ET.Element('Preset',paintopid=engine,name='Own194')
 for k,v in values.items():ET.SubElement(root,'param',name=k).text=str(v)
 return png_preset(root)
def rgba_png(w=3,h=7):
 image=Image.new('RGBA',(w,h));image.putdata([(30+i%4*40,80,150,[0,64,192,255][i%4])for i in range(w*h)]);out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
def native_pipe(selection='pressure',app=1,unequal=True):
 count=4 if selection=='dimensions'else 2
 header=(str(count)+' ncells:'+str(count)+' dim:2 rank0:2 sel0:angular rank1:2 sel1:pressure'if selection=='dimensions'else'2 ncells:2 dim:1 rank0:2 sel0:'+selection)
 def frame(i):
  w,h=(3,7)if i%2==0 or not unequal else(7,3);return struct.pack('>7I',29,2,w,h,4,0x47494d50,25)+b'\0'+bytes([30+i*20,80,150,128])*(w*h)
 return b'Own194\n'+header.encode()+b'\n'+b''.join(frame(i)for i in range(count))
def check_portable(root,c,record):
 validate194_portable(record['descriptor'],{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
 envelope={'library':{'schemaVersion':1,'brushes':[record],'assets':list(c.assets.values()),'skipped':[]},'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}}
 path=root/'own.grafetto-brushes.json';path.write_text(json.dumps(envelope));p=Catalog(root/'portable');convert.portable_bundle(path,p);assert p.brushes==[record]
 return envelope
class SketchSpray194Tests(unittest.TestCase):
 def test_both_native_families_composites_and_wash_foreground_never_proxy(self):
  with tempfile.TemporaryDirectory()as tmp:
   for engine in('sketchbrush','spraybrush'):
    for mode,target in NATIVE_MODES.items():
     for action in('1','2'):
      with self.subTest(engine=engine,mode=mode,action=action):
       root=Path(tmp)/(engine+mode+action);c=Catalog(root/'out');r=preset(native194(engine,params={'CompositeOp':mode,'PaintOpAction':action}),'Own194.kpp',c,{});d=r['descriptor'];self.assertTrue(scope194(d));f=d['sketch'if engine=='sketchbrush'else'spray'];self.assertEqual(f['composite'],'normal'if target=='erase'else target);self.assertEqual(d['behavior']['rendering']['blendMode'],'normal');self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken'if action=='2'else'directOver');self.assertEqual(d['behavior'].get('erase',False),target=='erase');check_portable(root,c,r)
 def test_all_profiles_noise_spikes_antialias_and_native_ignored_options(self):
  with tempfile.TemporaryDirectory()as tmp:
   for engine in('sketchbrush','spraybrush'):
    for profile in('default','gauss','soft'):
     for shape in('circle','rect'):
      with self.subTest(engine=engine,profile=profile,shape=shape):
       tip=f'<Brush type="auto_brush" spacing=".1" density=".5" randomness=".3"><MaskGenerator id="{profile}" type="{shape}" diameter="24" ratio=".6" hfade=".4" vfade=".7" spikes="5" antialiasEdges="1" softness_curve="0,0;0.4,0.8;1,0;"/></Brush>';root=Path(tmp)/(engine+profile+shape);c=Catalog(root/'out');r=preset(native194(engine,tip,{'PressureFlow':'true','FlowValue':'.2','PressureSoftness':'true','PressureSharpness':'true','Texture/Pattern/Enabled':'true'}),'Own194.kpp',c,{});d=r['descriptor'];self.assertTrue(scope194(d));self.assertEqual(d['tip']['autoNoise'],{'version':1,'density':.5,'randomness':.3});self.assertEqual(d['tip']['autoShape']['spikes'],5);self.assertTrue(d['tip']['profile']['antialias']);self.assertNotIn('texture',d);self.assertEqual(d['flow'],1);check_portable(root,c,r)
 def test_original_static_and_all_gih_pigment_selectors_geometry(self):
  with tempfile.TemporaryDirectory()as tmp:
   for engine in('sketchbrush','spraybrush'):
    for app in range(4):
     for selector in('static','constant','pressure','velocity','angular','xtilt','ytilt','random','incremental','dimensions'):
      with self.subTest(engine=engine,app=app,selector=selector):
       filename='own.png'if selector=='static'else'own.gih';raw=rgba_png()if selector=='static'else native_pipe(selector,app);tip=f'<Brush type="png_brush" filename="{filename}" brushApplication="{app}" spacing=".1"/>';root=Path(tmp)/(engine+str(app)+selector);c=Catalog(root/'out');r=preset(native194(engine,tip),'Own194.kpp',c,{filename:raw});d=r['descriptor'];self.assertTrue(scope194(d));self.assertNotIn('imageSampling',d['tip'])
       if selector=='static':self.assertEqual(d['tip']['sourceGeometry'],{'version':1,'width':3,'height':7})
       else:self.assertEqual(d['tip']['animation']['mode'],selector);self.assertEqual([(v['sourceWidth'],v['sourceHeight'])for v in d['tip']['animation']['geometry']['frames']][:2],[(3,7),(7,3)])
       if engine=='sketchbrush':self.assertEqual(d['sketch']['maskSignal'],'native-dab-v1');self.assertEqual(d['sketch']['maskSize'],[3,7])
       if app==1:self.assertIn('planes',d['tip']['color'])
       if app==2:self.assertIn('material',d['tip'])
       if app==3:self.assertIn('gradient',d['tip']['color'])
       check_portable(root,c,r)
 def test_text_and_image_particles_and_public_negative_whole_scope(self):
  with tempfile.TemporaryDirectory()as tmp:
   for engine in('sketchbrush','spraybrush'):
    root=Path(tmp)/engine;c=Catalog(root/'out');r=preset(native194(engine,'<Brush type="kis_text_brush" text="AB" pipe="true" font="DejaVu Sans,12,-1,5,50,0,0,0,0,0" spacing=".1"/>'),'Own194.kpp',c,{});self.assertTrue(scope194(r['descriptor']));check_portable(root,c,r)
   root=Path(tmp)/'image';c=Catalog(root/'out');r=preset(native194('spraybrush',params={'SprayShape/enabled':'true','SprayShape/shape':'4','SprayShape/width':'11','SprayShape/height':'5','SprayShape/imageUrl':'own.png','PaintOpAction':'2','CompositeOp':'grain_merge','ColorOption/useRandomOpacity':'true'}),'Own194.kpp',c,{'own.png':rgba_png()});d=r['descriptor'];self.assertTrue(d['spray']['particle']['image']);check_portable(root,c,r)
   for change in[lambda d:d.update(version=193),lambda d:d['behavior'].update(dual={}),lambda d:d['behavior'].update(timing={}),lambda d:d['behavior']['rendering'].update(blendMode='multiply'),lambda d:d['spray'].update(composite='unknown'),lambda d:d['behavior'].update(modulations={'flow':[]}),lambda d:d['tip'].update(sourceGeometry={'version':1,'width':1,'height':2})]:
    bad=copy.deepcopy(d);change(bad)
    with self.assertRaises(ValueError):validate194_portable(bad,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)
   with self.assertRaises(ValueError):preset(native194('sketchbrush',params={'CompositeOp':'unknown'}),'bad.kpp',Catalog(Path(tmp)/'bad'),{})
 def test_actual_pre194_literal_histories_remain_whole_exact(self):
  source=Path(__file__).parent/'fixtures/sketch_spray194_pre194_literal.json';payload=json.loads(source.read_text());self.assertEqual([r['descriptor']['version']for r in payload['library']['brushes']],[44,173,162,43,133,146,76])
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp)/'out');convert.portable_bundle(source,c);self.assertEqual(c.brushes,payload['library']['brushes']);self.assertEqual(list(c.assets.values()),payload['library']['assets'])
 def test_simple_and_static_original_geometry_are_closed(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c=Catalog(root/'out');record=preset(native194('sketchbrush',params={'Sketch/simpleMode':'true'}),'Own194.kpp',c,{});d=record['descriptor'];self.assertTrue(scope194(d))
   for change in[lambda d:d['tip'].update(hardness=.5),lambda d:d['tip'].update(aspect=2),lambda d:d['tip'].update(angle=.5),lambda d:d['tip'].update(rotation='path'),lambda d:d['behavior'].update(modulations={'hue':[]})]:
    bad=copy.deepcopy(d);change(bad);self.assertFalse(scope194(bad))
   c=Catalog(root/'bitmap');r=preset(native194('sketchbrush','<Brush type="png_brush" filename="own.png" brushApplication="1"/>'),'Own194.kpp',c,{'own.png':rgba_png()});d=r['descriptor']
   for change in[lambda d:d['sketch'].pop('maskSize'),lambda d:d['sketch'].update(maskSize=[7,3]),lambda d:d['tip']['sourceGeometry'].update(width=4),lambda d:d['tip'].update(imageSampling={'kind':'integer-pyramid','signal':'inverse-gray','sourceRect':{'x':0,'y':0,'width':3,'height':7}})]:
    bad=copy.deepcopy(d);change(bad)
    with self.assertRaises(ValueError):validate194_portable(bad,{a:v['size']for a,v in c.assets.items()},convert.validate_portable_profile,convert.validate_portable_dynamics)

 def test_animated_sketch_requires_known_original_dimensions(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp)/'out');r=preset(native194('sketchbrush','<Brush type="kis_text_brush" text="AB" pipe="true" font="DejaVu Sans,12,-1,5,50,0,0,0,0,0" spacing=".1"/>'),'text.kpp',c,{});d=r['descriptor'];self.assertTrue(scope194(d))
   d['tip']['animation'].pop('geometry',None);d['sketch'].pop('maskSize');self.assertFalse(scope194(d))

 def test_unknown_active_pressure_controls_are_not_erased_for_admission(self):
  with tempfile.TemporaryDirectory()as tmp:
   for engine in('sketchbrush','spraybrush'):
    with self.assertRaises(ValueError):preset(native194(engine,params={'PressureUnknown194':'true'}),'unknown.kpp',Catalog(Path(tmp)/engine),{})

 def test_new_family_metadata_cannot_upgrade_historical_tokens(self):
  with tempfile.TemporaryDirectory()as tmp:
   for engine,old in[('sketchbrush',44),('spraybrush',43)]:
    c=Catalog(Path(tmp)/engine);d=preset(native194(engine,params={'Sketch/simpleMode':'true'}),'Own194.kpp',c,{})['descriptor'];d['version']=old
    with self.assertRaises(ValueError):convert.validate_portable_profile(d)
