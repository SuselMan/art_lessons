from pathlib import Path
import unittest,tempfile,copy,json,base64
import test_bristle_wash135 as fixture
from brush_contract import Catalog
from krita_import import convert_krita,preset
from convert import portable_bundle
from bristle_soak139 import bristle_resize141_scope
class Initialization141(unittest.TestCase):
 def native(self,tmp,extra=None):
  raw=fixture.authored('1',{'HairyBristle/density':'100','HairyBristle/scale':'-1','RotationUseCurve':'false',**(extra or{})});p=Path(tmp)/'own.kpp';p.write_bytes(raw);c=Catalog(Path(tmp)/'native');convert_krita(p,c,{'own.gbr':fixture.GBR});self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);return c,raw
 def test_native141_negativescale_flags_and_nonfull_oldbranch(self):
  for density,version in[('100',141),('99',45)]:
   with tempfile.TemporaryDirectory()as tmp:
    c,_=self.native(tmp,{'HairyBristle/density':density});d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['bristle']['scale'],-1);self.assertEqual(bristle_resize141_scope(d),version==141)
    if version==141:self.assertEqual(d['bristle']['initialization'],{'sourceSide':4,'resizePolicy':'mask-population-v1'})
    else:self.assertNotIn('initialization',d['bristle'])
 def test_native142_only_antialiased_compositing_true_promotes(self):
  for aa in(False,True):
   for comp in(False,True):
    with self.subTest(aa=aa,compositing=comp),tempfile.TemporaryDirectory()as tmp:
     c,raw=self.native(tmp,{'HairyBristle/antialias':str(aa).lower(),'HairyBristle/useCompositing':str(comp).lower()});d=c.brushes[0]['descriptor']
     self.assertEqual(d['version'],142 if aa and comp else 141);self.assertEqual(d['bristle']['antialias'],aa);self.assertEqual(d['bristle']['compositing'],comp);self.assertTrue(bristle_resize141_scope(d));self.assertEqual(d['bristle']['initialization'],{'sourceSide':4,'resizePolicy':'mask-population-v1'})
     old=preset(raw,'own.kpp',Catalog(Path(tmp)/'legacy'),{'own.gbr':fixture.GBR},_allow_texture_material=False)['descriptor'];self.assertNotIn('initialization',old['bristle']);self.assertEqual(old['version'],45 if aa or comp else 66)
 def test_native_erase_preserves_old45_fallback(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,raw=self.native(tmp,{'Krita/erase':'true'});d=c.brushes[0]['descriptor']
   baseline=preset(raw,'own.kpp',Catalog(Path(tmp)/'baseline'),{'own.gbr':fixture.GBR},_allow_texture_material=False)['descriptor']
   self.assertEqual(d,baseline);self.assertEqual(d['version'],45);self.assertTrue(d['behavior']['erase']);self.assertNotIn('initialization',d['bristle'])
 def test_native_private_origin_stays_old_not_unowned141(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,raw=self.native(tmp)
   for args in({'depth':1},{'_allow_texture_material':False}):
    result=preset(raw,'own.kpp',Catalog(Path(tmp)/list(args)[0]),{'own.gbr':fixture.GBR},**args);self.assertEqual(result['descriptor']['version'],45);self.assertNotIn('initialization',result['descriptor']['bristle'])
 def test_portable141_roundtrip_and_closed_metadata(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}};p=Path(tmp)/'own.grafetto-brushes.json';p.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(p,good);self.assertEqual(good.brushes,c.brushes)
   for case in('revision','duplicate','alpha','source0','source257','policy','wash','child'):
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];h=d['bristle']
    if case=='revision':d['version']=140
    elif case=='duplicate':h['hairs'].append(h['hairs'][0][:])
    elif case=='alpha':h['hairs'][0][2]=.5
    elif case=='source0':h['initialization']['sourceSide']=0
    elif case=='source257':h['initialization']['sourceSide']=257
    elif case=='policy':h['initialization']['resizePolicy']='stretch'
    elif case=='wash':d['behavior']['rendering']['accumulation']='alphaDarken'
    else:
     child=copy.deepcopy(d);d.pop('bristle');d['version']=27;d['behavior']['dual']={'sampling':'independent','blendMode':'subtract','brush':child}
    p.write_text(json.dumps(e));bad=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,bad)
    self.assertEqual(bad.brushes,[]);self.assertEqual(bad.assets,{});self.assertEqual(list(bad.output.iterdir()),[])
