"""Self-authored nativeKPP, notvendor/nativeGUIpixelproof."""
import copy,tempfile,json,base64,unittest
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
from brush_contract import Catalog
from convert import portable_bundle,validate_portable_profile
class Unsharp159(unittest.TestCase):
 def record(self,root,light=True,smudge=True,amount=.5,threshold=0,radius=1):
  config='<params><param name="halfSize">'+str(radius)+'</param><param name="amount">'+str(amount)+'</param><param name="threshold">'+str(threshold)+'</param><param name="lightnessOnly">'+str(light).lower()+'</param></params>'
  file=root/'Own159.kpp';file.write_bytes(kpp(engine='filter',mode='copy',resources='<param name="Filter/id">unsharp</param><param name="Filter/smudgeMode">'+str(smudge).lower()+'</param><param name="Filter/configuration"><![CDATA['+config+']]></param>'));cat=Catalog(root/'native');convert_krita(file,cat);return cat
 def test_nativebothbranches_fullportable_zero_and16radius(self):
  for light in[False,True]:
   for radius in[0,16]:
    with tempfile.TemporaryDirectory()as t:
     root=Path(t);cat=self.record(root,light,radius=radius,amount=.001);self.assertEqual(cat.skipped,[]);d=cat.brushes[0]['descriptor'];self.assertEqual(d['version'],159);self.assertEqual(d['filter']['spatialPolicy'],'unsharp-lab-halo-v1');self.assertEqual(d['filter']['lightnessOnly'],light);env={'library':cat.write(),'assets':{k:base64.b64encode((cat.output/v['file']).read_bytes()).decode()for k,v in cat.assets.items()}};f=root/'own.grafetto-brushes.json';f.write_text(json.dumps(env));out=Catalog(root/'portable');portable_bundle(f,out);self.assertEqual(out.brushes,cat.brushes)
 def test_ordinary52unchanged_andinvalidnewmarkers_preoutput(self):
  with tempfile.TemporaryDirectory()as t:
   cat=self.record(Path(t),smudge=False);self.assertEqual(cat.brushes[0]['descriptor']['version'],52);self.assertNotIn('spatialPolicy',cat.brushes[0]['descriptor']['filter'])
  with tempfile.TemporaryDirectory()as t:d=self.record(Path(t)).brushes[0]['descriptor']
  for case in['version','policy','threshold','aspect','erase','dual']:
   x=copy.deepcopy(d)
   if case=='version':x['version']=158
   elif case=='policy':x['filter']['spatialPolicy']='gaussian-halo-v1'
   elif case=='threshold':x['filter']['threshold']=.1
   elif case=='aspect':x['filter']['radiusY']=2
   else:x['behavior'][case]=True if case=='erase'else{}
   with self.subTest(case=case),self.assertRaises(ValueError):validate_portable_profile(x)
