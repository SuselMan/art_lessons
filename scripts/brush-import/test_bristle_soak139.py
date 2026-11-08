"""Authored native-format mechanism proof; stock gain zero, not an official preset."""
from pathlib import Path
import copy,json,base64,tempfile,unittest
from test_bristle_wash135 import authored,GBR
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita,preset
from convert import portable_bundle,validate_portable_profile
from bristle_soak139 import bristle_soak139_scope

EXTRA={'HairyInk/enabled':'true','HairyInk/soak':'true','HairyInk/inkAmount':'4','HairyInk/useSaturation':'false','HairyBristle/random':'0','RotationUseCurve':'false'}
def native_raw(extra=None):return authored('1',{**EXTRA,**(extra or{})})
class Soak139(unittest.TestCase):
 def native(self,tmp,extra=None):
  raw=native_raw(extra);p=Path(tmp)/'Soak.kpp';p.write_bytes(raw);c=Catalog(Path(tmp)/'native');convert_krita(p,c,{'own.gbr':GBR});self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);return c,raw
 def test_native_original_bytes_side_before_normalization_and_old72_control(self):
  ds=[]
  for soak,version in[('true',140),('false',72)]:
   with tempfile.TemporaryDirectory()as tmp:
    c,raw=self.native(tmp,{'HairyInk/soak':soak});d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);self.assertEqual(bristle_soak139_scope(d),soak=='true');self.assertTrue(c.assets)
    if soak=='true':
     self.assertEqual(d['bristle']['soak'],{'sourcePolicy':'canonical-begin-v1','initialSide':4,'resizePolicy':'mask-population-v1'});self.assertTrue(all(abs(v*4-round(v*4))<1e-9 for h in d['bristle']['hairs']for v in h[:2]));self.assertTrue(any(n['feature']=='bristleSoak'and n['status']=='approximate'for n in c.brushes[0]['compatibility']))
    ds.append(copy.deepcopy(d))
  ds[0]['bristle'].pop('soak');self.assertEqual(ds[0]['bristle'],ds[1]['bristle']);self.assertEqual(ds[0]['sizeByPressure'],ds[1]['sizeByPressure']);self.assertEqual(ds[0]['opacityByPressure'],ds[1]['opacityByPressure'])
 def test_native_alpha_policy_flags_and_inactive_soak_are_preserved(self):
  for alpha in('false','true'):
   with tempfile.TemporaryDirectory()as tmp:
    c,_=self.native(tmp,{'HairyInk/useOpacity':alpha});self.assertEqual(c.brushes[0]['descriptor']['bristle']['ink']['useOpacity'],alpha=='true')
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp,{'HairyInk/enabled':'false'});self.assertEqual(c.brushes[0]['descriptor']['version'],45);self.assertNotIn('soak',c.brushes[0]['descriptor']['bristle'])
 def test_portable_closed_scope_and_fail_before_published_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}};p=Path(tmp)/'Soak.grafetto-brushes.json';p.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(p,good);self.assertEqual(good.brushes,c.brushes)
   for case in('downgrade','zero','float','bool','huge','policy','extra','grid','nan','bounds','noink','wash','timer','erase','foreign','dual','child','lookup','flow'):
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];h=d['bristle'];b=d['behavior']
    if case=='downgrade':d['version']=138
    elif case in('zero','float','bool','huge'):h['soak']['initialSide']={'zero':0,'float':4.5,'bool':True,'huge':257}[case]
    elif case=='policy':h['soak']['sourcePolicy']='current'
    elif case=='extra':h['soak']['extra']=1
    elif case=='grid':h['hairs'][0][0]=-.13
    elif case=='nan':h['hairs'][0][0]=float('nan')
    elif case=='bounds':h['hairs'][0][0]=.5
    elif case=='noink':h['version']=1
    elif case=='wash':b['rendering']['accumulation']='alphaDarken'
    elif case=='timer':b['timing']={'version':1,'rate':1,'ignoreDistanceSpacing':False}
    elif case=='erase':b['erase']=True
    elif case=='foreign':d['grid']={}
    elif case=='dual':b['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);d.pop('bristle');d['version']=27;b['dual']={'sampling':'independent','blendMode':'subtract','brush':child}
    elif case=='lookup':h['ink']['useSaturation']=True
    else:d['flow']=.5
    p.write_text(json.dumps(e));bad=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,bad)
    self.assertEqual(bad.brushes,[]);self.assertEqual(bad.assets,{});self.assertEqual(list(bad.output.iterdir()),[])
 def test_native_bad_scope_and_foreign_origin(self):
  for extra in({'PaintOpAction':'2'},{'Krita/erase':'true'},{'PaintOpSettings/isAirbrushing':'true'},{'AirbrushOption/isAirbrushing':'true'}):
   with tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp)/'bad.kpp';p.write_bytes(native_raw(extra));c=Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gbr':GBR});self.assertTrue(c.skipped);self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{})
  for args in({'depth':1},{'_allow_texture_material':False}):
   with tempfile.TemporaryDirectory()as tmp:
    with self.assertRaisesRegex(ValueError,'root native Bristle'):preset(native_raw(),'bad.kpp',Catalog(Path(tmp)/'out'),{'own.gbr':GBR},**args)
 def test_integral_json_numbers_and_no_new_wire_inputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);d=copy.deepcopy(c.brushes[0]['descriptor']);d['version']=140.0;d['bristle']['version']=2.0;d['bristle']['soak']['initialSide']=4.0;self.assertTrue(bristle_soak139_scope(d));validate_portable_profile(d)
