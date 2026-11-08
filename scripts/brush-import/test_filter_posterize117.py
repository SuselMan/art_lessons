from pathlib import Path
import tempfile,unittest,json,copy,struct,hashlib
from test_krita import kpp
from brush_contract import Catalog,finalize_identity
from krita_import import preset
from convert import portable_bundle
class FilterPosterize117Tests(unittest.TestCase):
 def convert(self,cfg='',extra='',filter_id='posterize',mode='copy'):
  params='<param name="Filter/id">'+filter_id+'</param><param name="Filter/configuration"><![CDATA[<params>'+cfg+'</params>]]></param>'+extra;data=kpp(engine='filter',mode=mode,resources=params)
  with tempfile.TemporaryDirectory()as folder:
   result=preset(data,'OwnPosterize.kpp',Catalog(Path(folder)),{});self.assertEqual(finalize_identity(copy.deepcopy(result['descriptor']),data)['id'],result['descriptor']['id']);return result
 def test_genuine_native_steps_default_and_original_source_identity_unused_blur(self):
  for steps in[2,7,16,128]:
   result=self.convert('<param name="steps">'+str(steps)+'</param>');d=result['descriptor'];self.assertEqual(d['version'],117);self.assertEqual(d['filter'],{'version':2,'kind':'posterize','steps':steps});self.assertEqual(d['mixer']['source'],'previousCanvas');self.assertTrue(any('ALL four straight RGBA'in n['detail']and'ICC'in n['detail']for n in result['compatibility']));extra=self.convert('<param name="steps">'+str(steps)+'</param><param name="halfSize">invalid unused</param><param name="amount">NaN</param>');self.assertEqual({k:v for k,v in extra['descriptor'].items()if k!='id'},{k:v for k,v in d.items()if k!='id'})
  self.assertEqual(self.convert()['descriptor']['filter']['steps'],16)
  self.assertEqual(self.convert(filter_id='invert')['descriptor']['filter'],{'version':2,'kind':'invert'});self.assertEqual(self.convert(filter_id='desaturate')['descriptor']['filter'],{'version':2,'kind':'desaturate','type':0})
 def test_native_invalid_steps_duplicate_smudge_erase_timer_noncopy_do_not_default(self):
  for v in['0','1','129','2.5','NaN','Infinity','bad','']:
   with self.subTest(v=v),self.assertRaises(ValueError):self.convert('<param name="steps">'+v+'</param>')
  with self.assertRaises(ValueError):self.convert('<param name="steps">2</param><param name="steps">16</param>')
  with self.assertRaises(ValueError):self.convert(mode='normal')
  for key in['Filter/smudgeMode','EraserMode','PaintOpSettings/isAirbrushing']:
   with self.assertRaises(ValueError):self.convert(extra='<param name="'+key+'">true</param>')
 def test_portable_positive_and_exactscope_negatives_before_any_output(self):
  result=self.convert();original={'library':{'schemaVersion':1,'brushes':[result],'assets':[],'skipped':[]},'assets':{}}
  with tempfile.TemporaryDirectory()as folder:
   p=Path(folder)/'Own.grafetto-brushes.json';p.write_text(json.dumps(original));out=Catalog(Path(folder)/'positive');portable_bundle(p,out);self.assertEqual(out.brushes,[result])
   for case in['below117','steps1','steps129','fraction','bool','missing','extra','v1','kind','erase','dual','emptydual','child','source','timing','otherfamily','clone','cloneNull','mypaint','mypaintNull','tangentNormal','tangentNormalNull']:
    bad=copy.deepcopy(original);d=bad['library']['brushes'][0]['descriptor'];f=d['filter']
    if case=='below117':d['version']=116
    elif case=='steps1':f['steps']=1
    elif case=='steps129':f['steps']=129
    elif case=='fraction':f['steps']=2.5
    elif case=='bool':f['steps']=True
    elif case=='missing':f.pop('steps')
    elif case=='extra':f['radiusX']=0
    elif case=='v1':f['version']=1
    elif case=='kind':f['kind']='threshold'
    elif case=='erase':d['behavior']['erase']=True
    elif case in('dual','emptydual'):d['behavior']['dual']={}if case=='emptydual'else{'brush':copy.deepcopy(d),'blendMode':'normal'}
    elif case=='child':
     child=copy.deepcopy(d);d.pop('filter');d.pop('mixer');d['model']='stamp';d['behavior']['dual']={'brush':child,'blendMode':'normal'}
    elif case=='source':d['mixer']['source']='projectionCanvas'
    elif case=='timing':d['behavior']['timing']={}
    elif case in('clone','mypaint','tangentNormal'):d[case]={}
    elif case in('cloneNull','mypaintNull','tangentNormalNull'):d[case[:-4]]=None
    else:d['hatching']={}
    p.write_text(json.dumps(bad));out=Catalog(Path(folder)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,out)
    self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])

 def test_genuine_bitmap_mask_CAS_and_original_identity_are_unmodified(self):
  plane=bytes([255,0,128,255,0,255,0,128,128,0,255,0,255,128,0,255]);raw=struct.pack('>7I',29,2,4,4,1,0x47494d50,25)+b'\0'+plane
  params='<param name="Filter/id">posterize</param><param name="Filter/configuration"><![CDATA[<params><param name="steps">7</param></params>]]></param>';data=kpp('<Brush type="gbr_brush" filename="own-mask.gbr" ColorAsMask="1"/>',engine='filter',mode='copy',resources=params)
  with tempfile.TemporaryDirectory()as folder:
   c=Catalog(Path(folder));b=preset(data,'OwnMaskPosterize.kpp',c,{'own-mask.gbr':raw});d=b['descriptor'];aid='asset:'+hashlib.sha256(plane).hexdigest();self.assertEqual(d['tip']['mask'],aid);self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),plane);self.assertEqual(finalize_identity(copy.deepcopy(d),data)['id'],d['id'])
