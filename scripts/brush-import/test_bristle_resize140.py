from pathlib import Path
import tempfile,unittest,copy,json,base64
import test_bristle_soak139 as soak139
from brush_contract import Catalog
from convert import portable_bundle
from bristle_soak139 import bristle_soak139_scope
class Resize140(unittest.TestCase):
 def test_native_fullmask_auto140_and_density_fallback139_explicit(self):
  for density,version in[('100',140),('99',139)]:
   with tempfile.TemporaryDirectory()as tmp:
    c,_=soak139.Soak139().native(tmp,{'HairyBristle/density':density});d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertTrue(bristle_soak139_scope(d));self.assertEqual(d['bristle']['soak'].get('resizePolicy'),'mask-population-v1'if version==140 else None);self.assertTrue(any(n['feature']=='bristleResize'for n in c.brushes[0]['compatibility']))
 def test_portable140_duplicate_grid_and_alpha_rejects_but139_preserved(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=soak139.Soak139().native(tmp);env={'library':c.write(),'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}};p=Path(tmp)/'own.grafetto-brushes.json';p.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(p,good);self.assertEqual(good.brushes,c.brushes)
   for case in('revision','policy','duplicate','alphaZero','alphaNotU8','side65'):
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];h=d['bristle'];s=h['soak']
    if case=='revision':d['version']=139
    elif case=='policy':s['resizePolicy']='stretch'
    elif case=='duplicate':h['hairs'].append(h['hairs'][0][:])
    elif case=='alphaZero':h['hairs'][0][2]=0
    elif case=='alphaNotU8':h['hairs'][0][2]=.5
    else:s['initialSide']=65
    p.write_text(json.dumps(e));bad=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,bad)
    self.assertEqual(bad.assets,{});self.assertEqual(bad.brushes,[]);self.assertEqual(list(bad.output.iterdir()),[])
   old=copy.deepcopy(env);d=old['library']['brushes'][0]['descriptor'];d['version']=139;d['bristle']['soak'].pop('resizePolicy');d['bristle']['hairs'].append(d['bristle']['hairs'][0][:]);p.write_text(json.dumps(old));legacy=Catalog(Path(tmp)/'legacy');portable_bundle(p,legacy);self.assertEqual(legacy.brushes,old['library']['brushes'])
