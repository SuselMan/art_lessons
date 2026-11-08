import copy,json,tempfile,unittest
from pathlib import Path
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
class CloneProjection149(unittest.TestCase):
 def native(self,projection=True):
  with tempfile.TemporaryDirectory()as t:return preset(kpp(engine='duplicate',resources='<param name="Duplicateop/CloneFromProjection">'+str(projection).lower()+'</param>'),'own.kpp',Catalog(Path(t)),{})
 def env(self,b):return{'library':{'schemaVersion':1,'assets':[],'brushes':[b],'skipped':[]},'assets':{}}
 def test_native149_and_old54_roundtrip(self):
  for projection,version in[(True,149),(False,54)]:
   b=self.native(projection);self.assertEqual(b['descriptor']['version'],version)
   with tempfile.TemporaryDirectory()as t:
    p=Path(t)/'b.grafetto-brushes.json';p.write_text(json.dumps(self.env(b)));c=Catalog(Path(t)/'out');portable_bundle(p,c);self.assertEqual(c.brushes,[b])
 def test_new_scope_rejects_before_outputs(self):
  original=self.native()
  for case in('revision','policy','source','dual','child','erase','timer','texture','image','unknown','foreign'):
   b=copy.deepcopy(original);d=b['descriptor'];c=d['clone'];v=d['behavior']
   if case=='revision':d['version']=148
   elif case=='policy':c['sourcePolicy']='current'
   elif case=='source':c['source']='previousCanvas'
   elif case=='dual':v['dual']=None
   elif case=='child':
    child=copy.deepcopy(d);d.pop('clone');d['version']=45;v['dual']={'brush':child,'sampling':'independent','blendMode':'normal'}
   elif case=='erase':v['erase']=True
   elif case=='timer':v['timing']={}
   elif case=='texture':d['texture']={}
   elif case=='image':d['tip']['color']={}
   elif case=='foreign':d['filter']=None
   else:c['unknown']=True
   with self.subTest(case=case),tempfile.TemporaryDirectory()as t:
    p=Path(t)/'b.grafetto-brushes.json';p.write_text(json.dumps(self.env(b)));out=Catalog(Path(t)/'out')
    with self.assertRaises(ValueError):portable_bundle(p,out)
    self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
