"""Finite portable boundary witnesses; authored147 metadata is not native artwork."""
import copy,json,tempfile,unittest
from pathlib import Path
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
class CanonicalEffectPortable(unittest.TestCase):
 def native(self,engine,params):
  with tempfile.TemporaryDirectory()as t:return preset(kpp(engine=engine,mode='copy',resources=params),'own.kpp',Catalog(Path(t)),{})
 def portable(self,b):return {'library':{'schemaVersion':1,'assets':[],'brushes':[b],'skipped':[]},'assets':{}}
 def roundtrip(self,b):
  with tempfile.TemporaryDirectory()as t:
   p=Path(t)/'own.grafetto-brushes.json';p.write_text(json.dumps(self.portable(b)));c=Catalog(Path(t)/'out');portable_bundle(p,c);self.assertEqual(c.brushes,[b])
 def smudge(self,kind='invert'):
  b=self.native('filter','<param name="Filter/id">'+kind+'</param>');d=b['descriptor'];d['version']=147;d['tip']={'kind':'round','aspect':1,'angle':0,'rotation':'fixed','hardness':1};d['filter'].update(smudgeMode=True,sourcePolicy='canonical-begin-v1');return b
 def test_native145_old51_and_legacy_pointwise_roundtrip_unchanged(self):
  for flag,version in [('true',145),('false',51)]:
   b=self.native('deformbrush','<param name="Deform/useOldData">'+flag+'</param>');self.assertEqual(b['descriptor']['version'],version);self.roundtrip(b)
  for kind,version in [('invert',95),('desaturate',99),('posterize',117)]:
   b=self.native('filter','<param name="Filter/id">'+kind+'</param>');self.assertEqual(b['descriptor']['version'],version);self.roundtrip(b)
 def test_three_native147_pointwise_profiles_roundtrip(self):
  for kind in('invert','desaturate','posterize'):
   b=self.native('filter','<param name="Filter/id">'+kind+'</param><param name="Filter/smudgeMode">true</param>');self.assertEqual(b['descriptor']['version'],147);self.roundtrip(b)
 def test_three_authored147_pointwise_configs_preserve_full_record(self):
  for kind in('invert','desaturate','posterize'):self.roundtrip(self.smudge(kind))
 def test_new_sources_reject_downgrade_policy_child_and_foreign_before_outputs(self):
  bases=[self.native('deformbrush','<param name="Deform/useOldData">true</param>'),self.smudge()]
  for baseline in bases:
   for case in('downgrade','policy','child','dual','timer','erase','texture','projection','wetEdges','config','nullRendering','shape','cloneNull','mypaintNull','tangentNormalNull'):
    b=copy.deepcopy(baseline);d=b['descriptor'];key='deform'if'deform'in d else'filter';c=d[key];behavior=d['behavior']
    if case=='downgrade':d['version']=51 if key=='deform'else 95
    elif case=='policy':c['sourcePolicy']='current'
    elif case=='child':
     child=copy.deepcopy(d);d.pop(key);d.pop('mixer');d['model']='stamp';d['version']=45;behavior['dual']={'brush':child,'sampling':'independent','blendMode':'normal'}
    elif case=='dual':behavior['dual']=None
    elif case=='timer':behavior['timing']={}
    elif case=='erase':behavior['erase']=True
    elif case=='texture':d['texture']={}
    elif case=='projection':d['mixer']['source']='projectionCanvas'
    elif case=='wetEdges':behavior['rendering']['wetEdges']=.1
    elif case=='config':c['unknown']=True
    elif case=='nullRendering':behavior['rendering']=None
    elif case.endswith('Null'):d[case[:-4]]=None
    elif key=='filter':d['tip']['kind']='bitmap'
    else:c['mode']=True
    with self.subTest(kind=key,case=case),tempfile.TemporaryDirectory()as t:
     p=Path(t)/'own.grafetto-brushes.json';p.write_text(json.dumps(self.portable(b)));out=Catalog(Path(t)/'out')
     with self.assertRaises(ValueError):portable_bundle(p,out)
     self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
