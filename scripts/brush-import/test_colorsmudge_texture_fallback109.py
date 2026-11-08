"""Authored original KPP/RGBA patterns; real native and portable importer."""
from pathlib import Path
import io,tempfile,unittest,copy,json,base64,hashlib
from PIL import Image,PngImagePlugin
from brush_contract import Catalog
from krita_import import convert_krita
from convert import portable_bundle
PIXELS=[(0,0,0,128),(255,255,255,64),(255,0,0,255),(0,0,255,255),(0,255,0,255),(0,0,0,0)]
def original(raw,modern=True,params=None,engine='colorsmudge'):
 values={'CompositeOp':'normal','SizeUseCurve':'false','SmudgeRateUseNewEngine':'true'if modern else'false','Texture/Pattern/Enabled':'true','Texture/Pattern/PatternFileName':'pattern109.png','Texture/Pattern/TexturingMode':str(raw),**(params or{})}
 xml=f'<Preset name="Authored109" paintopid="{engine}">'+''.join('<param name="'+key+'"><![CDATA['+value+']]></param>'for key,value in values.items())+'<param name="brush_definition"><![CDATA[<Brush type="png_brush" filename="tip109.png" brushApplication="0"/>]]></param></Preset>'
 meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',xml,zip=True);out=io.BytesIO();Image.new('RGB',(4,4),'white').save(out,format='PNG',pnginfo=meta);return out.getvalue()
def fixture(root,raw,modern=True,params=None,engine='colorsmudge'):
 data=original(raw,modern,params,engine);path=root/'original.kpp';path.write_bytes(data)
 def png(image):
  out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
 pattern=Image.new('RGBA',(3,2));pattern.putdata(PIXELS);resources={'pattern109.png':png(pattern),'tip109.png':png(Image.new('RGBA',(4,4),(0,0,0,128)))};catalog=Catalog(root/'output');convert_krita(path,catalog,resources);return catalog,data

def painting(brush):return{k:v for k,v in brush['descriptor'].items()if k!='id'}
def assets(catalog):return{key:(dict(asset),(catalog.output/asset['file']).read_bytes())for key,asset in catalog.assets.items()}
def identity(brush,raw):
 value={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(raw).hexdigest(),'rendering':painting(brush)}
 return'imported-'+hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24]
class ColorSmudgeNativeTextureFallback109Tests(unittest.TestCase):
 def test_raw2_raw3_are_exact_native_subtract_not_new_colour_modes(self):
  settings=[{}, {'Texture/Pattern/UseSoftTexturing':'true','PressureTexture/Strength/':'true','Texture/Strength/Value':'.25','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'}, {'Texture/Pattern/UseSoftTexturing':'true','Texture/Pattern/Brightness':'.1','Texture/Pattern/Contrast':'1.4','Texture/Pattern/NeutralPoint':'.25','Texture/Pattern/Invert':'true','Texture/Pattern/CutoffPolicy':'1','Texture/Pattern/CutoffLeft':'33','Texture/Pattern/CutoffRight':'201'}, {'Texture/Pattern/CutoffPolicy':'2','Texture/Pattern/CutoffLeft':'128','Texture/Pattern/CutoffRight':'220'}, {'PressureTexture/Strength/':'false','Texture/Strength/UseCurve':'true','Texture/Strength/Value':'NaN','Texture/Strength/Sensor':'malformed UNUSED sensor'}]
  for modern in(False,True):
   for extra in settings:
    with tempfile.TemporaryDirectory()as tmp:
     root=Path(tmp)
     # Separate input/output roots keep raw capture and asset ownership explicit.
     paths=[root/str(n)for n in(1,2,3)]
     for p in paths:p.mkdir()
     control,control_raw=fixture(paths[0],1,modern,extra);self.assertEqual(control.skipped,[]);reference=control.brushes[0]
     for raw_mode,path in zip((2,3),paths[1:]):
      c,raw=fixture(path,raw_mode,modern,extra);self.assertEqual(c.skipped,[]);actual=c.brushes[0]
      self.assertEqual(painting(actual),painting(reference));self.assertEqual(assets(c),assets(control));self.assertEqual(actual['sourceDefaults'],reference['sourceDefaults']);self.assertEqual(actual['warnings'],reference['warnings']);self.assertEqual(actual['descriptor']['id'],identity(actual,raw));self.assertNotEqual(actual['descriptor']['id'],reference['descriptor']['id']);self.assertNotEqual(raw,control_raw)
      notes=[n for n in actual['compatibility']if n['feature']=='nativeTextureModeFallback'];self.assertEqual(len(notes),1);self.assertEqual(notes[0]['status'],'supported');self.assertFalse(any(n['feature']=='textureApplication'and n['status']=='unsupported'for n in actual['compatibility']));self.assertNotIn('gradient',actual['descriptor'].get('texture',{}));self.assertNotIn('color',actual['descriptor']['tip'])
 def test_rgba_flatten_and_cutoff_literals_follow_effective_scalar_mode_before_alpha_selection(self):
  for raw in(1,2,3):
   for params,expected in[({},[127,255,87,0,39,127,255,0]+[0]*8),({'Texture/Pattern/CutoffPolicy':'1','Texture/Pattern/CutoffLeft':'100','Texture/Pattern/CutoffRight':'200'},[127,0,0,0,0,127,0,0]+[0]*8),({'Texture/Pattern/CutoffPolicy':'2','Texture/Pattern/CutoffLeft':'100','Texture/Pattern/CutoffRight':'200'},[127,255,255,0,255,127,255,0]+[0]*8),({'Texture/Pattern/Invert':'true','Texture/Pattern/CutoffPolicy':'1','Texture/Pattern/CutoffLeft':'100','Texture/Pattern/CutoffRight':'200'},[128,0,168,0,0,128,0,0]+[0]*8)]:
    with tempfile.TemporaryDirectory()as tmp:
     c,_=fixture(Path(tmp),raw,params=params);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];t=d['texture'];self.assertEqual(t['application']['mode'],'subtract');self.assertEqual(t['patternSize'],{'width':3,'height':2});a=c.assets[t['id']];self.assertEqual((c.output/a['file']).read_bytes(),bytes(expected))
 def test_full_portable_keeps_explicit_subtract_and_old_application_absent_without_reinterpretation(self):
  for mode in(2,3):
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c,_=fixture(root,mode);m=c.write();payload={'library':m,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in m['assets']}};path=root/'new.grafetto-brushes.json';path.write_text(json.dumps(payload));out=Catalog(root/'portable');portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
    # Schema-only stored historical grain control; no native reinterpretation
    # occurs on portable import and no historical real-export identity claimed.
    old=copy.deepcopy(payload);d=old['library']['brushes'][0]['descriptor'];d['texture'].pop('application');d['texture'].pop('patternSize');d['texture'].pop('offset');path=root/'old.grafetto-brushes.json';path.write_text(json.dumps(old));prior=Catalog(root/'old-portable');portable_bundle(path,prior);self.assertEqual(prior.brushes,old['library']['brushes'])
 def test_hatching_and_pixel_are_not_blanket_aliased_by_this_correction(self):
  for engine in('paintbrush','hatchingbrush'):
   for raw in(2,3):
    with tempfile.TemporaryDirectory()as tmp:
     c,_=fixture(Path(tmp),raw,engine=engine)
     # Pixel108 may independently add Lightness, or reject its own narrow
     # combination. Either outcome must NOT be a ColorSmudge alias.
     if not c.brushes:self.assertTrue(c.skipped);continue
     b=c.brushes[0];self.assertFalse(any(n['feature']=='nativeTextureModeFallback'for n in b['compatibility']));self.assertNotEqual(b['descriptor'].get('texture',{}).get('application',{}).get('mode'),'subtract')
     if engine=='hatchingbrush':self.assertNotIn('texture',b['descriptor']);self.assertTrue(any(n['feature']=='textureApplication'and n['status']=='unsupported'for n in b['compatibility']))
