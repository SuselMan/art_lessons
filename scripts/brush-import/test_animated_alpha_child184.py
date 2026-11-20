import unittest,tempfile,json,base64,copy,subprocess
from pathlib import Path
from test_krita import kpp
from test_sketch_gih174 import pipe174
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
class AnimatedAlphaChild184Tests(unittest.TestCase):
 def raw(self,mode='hard_mix_softer_photoshop'):
  options='<param name="PaintOpAction">1</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MaskingCompositeOp">'+mode+'</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="gbr_brush" filename="own184.gih" scale="1" ColorAsMask="1"/>]]></param>'
  return kpp(resources=options)
 def test_native_frames_child_rank_modes_and_whole_portable(self):
  for mode in('hard_mix_softer_photoshop','hard_mix_photoshop'):
   for selector in('constant','incremental','pressure'):
    with self.subTest(mode=mode,selector=selector),tempfile.TemporaryDirectory()as tmp:
     c=Catalog(Path(tmp)/'native');record=preset(self.raw(mode),'Own184.kpp',c,{'own184.gih':pipe174(selector)});c.brushes.append(record);d=record['descriptor'];self.assertEqual(d['version'],184);a=d['behavior']['dual']['brush']['tip']['animation'];self.assertEqual(a['mode'],selector);self.assertEqual(len(a['frames']),2)
     if selector=='pressure':self.assertEqual(a['rank'],2)
     for right,aid in enumerate(a['frames']):self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes(255 if(x>=2)==bool(right)else 0 for y in range(4)for x in range(4)))
     lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}};p=Path(tmp)/'portable.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'roundtrip');portable_bundle(p,out);self.assertEqual(out.brushes,[record]);self.assertEqual(out.write()['assets'],lib['assets'])
 def test_native_rejects_random_angular_and_unequal_instead_of_flattening(self):
  for selector,dims in [('random',(4,4)),('angular',(4,4)),('incremental',(8,4))]:
   with self.subTest(selector=selector,dims=dims),tempfile.TemporaryDirectory()as tmp:
    with self.assertRaises(ValueError):preset(self.raw(),'Own184.kpp',Catalog(Path(tmp)/'native'),{'own184.gih':pipe174(selector,dims=dims)})
 def test_existing_generic_all_selectors_whole_record_unchanged(self):
  pin='552830b280f00842b535e9dc5580f11da0c9f9a4';ns={'__name__':'baseline_import'};code=subprocess.check_output(['git','show',pin+':scripts/brush-import/krita_import.py']);exec(compile(code,'krita_import.py','exec'),ns)
  for mode in('multiply','subtract','darken'):
   for selector in('constant','incremental','pressure','random'):
    with self.subTest(mode=mode,selector=selector),tempfile.TemporaryDirectory()as tmp:
     raw=self.raw(mode);resources={'own184.gih':pipe174(selector)};old=ns['preset'](raw,'Old.kpp',Catalog(Path(tmp)/'old'),resources);new=preset(raw,'Old.kpp',Catalog(Path(tmp)/'new'),resources);self.assertEqual(new,old);self.assertNotEqual(new['descriptor']['version'],184)
 def test_existing_static168_and_original151_whole_records_unchanged(self):
  from test_dual_mask168 import DualMask168Tests
  from PIL import Image
  import io
  ns={'__name__':'baseline_import'};code=subprocess.check_output(['git','show','552830b280f00842b535e9dc5580f11da0c9f9a4:scripts/brush-import/krita_import.py']);exec(compile(code,'krita_import.py','exec'),ns)
  png=io.BytesIO();Image.new('RGBA',(2,2),(200,100,50,128)).save(png,format='PNG')
  mask='<Brush type="auto_brush" spacing="0.3" angle="0"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>'
  options='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MaskingCompositeOp">multiply</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA['+mask+']]></param>'
  examples=[(DualMask168Tests().raw(),{}),(kpp('<Brush type="png_brush" filename="own151.png" brushApplication="1"/>',resources=options),{'own151.png':png.getvalue()})]
  for raw,resources in examples:
   with tempfile.TemporaryDirectory()as tmp:
    old=ns['preset'](raw,'Old.kpp',Catalog(Path(tmp)/'old'),resources);new=preset(raw,'Old.kpp',Catalog(Path(tmp)/'new'),resources);self.assertEqual(new,old);self.assertIn(new['descriptor']['version'],(151,168))
 def test_malformed_behavior_and_dual_are_false_and_portable_valueerror(self):
  from dual_mask168 import pixel_alpha_dual168_scope
  for value in(None,False,1,'bad',[],{'behavior':None},{'behavior':[]},{'behavior':'bad'},{'behavior':{'dual':None}},{'behavior':{'dual':[]}},{'behavior':{'dual':'bad'}}):self.assertFalse(pixel_alpha_dual168_scope(value))
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp)/'native');record=preset(self.raw(),'Own184.kpp',c,{'own184.gih':pipe174()});c.brushes.append(record);self.assertTrue(pixel_alpha_dual168_scope(record['descriptor']));lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}}
   for key in('behavior','dual'):
    for i,value in enumerate((None,False,1,'bad',[])):
     bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
     if key=='behavior':d['behavior']=value
     else:d['behavior']['dual']=value
     self.assertFalse(pixel_alpha_dual168_scope(d));p=Path(tmp)/(key+str(i)+'.json');p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/(key+str(i)))
     with self.subTest(key=key,value=value),self.assertRaises(ValueError):portable_bundle(p,out)
     self.assertFalse(out.brushes);self.assertFalse(out.assets)
 def test_portable_wrong_scope_is_atomic(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp)/'native');record=preset(self.raw(),'Own184.kpp',c,{'own184.gih':pipe174()});c.brushes.append(record);lib=c.write();env={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}}
   for case in('random','version','inline','color','geometry','rank'):
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];child=d['behavior']['dual']['brush'];a=child['tip']['animation']
    if case=='random':a['mode']='random'
    elif case=='version':d['version']=168
    elif case=='inline':d['behavior']['dual']['sampling']='inline'
    elif case=='color':child['tip']['color']={'planes':a['frames']+[a['frames'][0]]}
    elif case=='geometry':a['geometry']={'version':1,'frames':[]}
    else:a['mode']='pressure';a['rank']=2.5
    p=Path(tmp)/(case+'.json');p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,out)
    self.assertFalse(out.brushes);self.assertFalse(out.assets)
if __name__=='__main__':unittest.main()
