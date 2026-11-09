import base64,copy,json,tempfile,unittest,zipfile
from pathlib import Path
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset,convert_krita
from mypaint_import import mypaint_preset
from mypaint_legacy156 import validate_mypaint_legacy156
from convert import portable_bundle,validate_portable_profile
class MyPaintLegacy156(unittest.TestCase):
 def document(self,paint=True):return {'version':3,'settings':{'offset_by_random':{'base_value':.3,'inputs':{}},**({'paint_mode':{'base_value':.8,'inputs':{'pressure':[[0,-.2],[1,.2]]}}}if paint else{})}}
 def raw(self,paint=True):return kpp(engine='mypaintbrush',resources='<param name="MyPaint/json" type="bytearray">'+base64.b64encode(json.dumps(self.document(paint)).encode()).decode()+'</param>')
 def test_kpp_actualnative_preserves_allsettings_andportable(self):
  with tempfile.TemporaryDirectory()as t:
   cat=Catalog(Path(t)/'native');record=preset(self.raw(),'SelfAuthored156.kpp',cat,{});cat.brushes.append(record);d=record['descriptor'];self.assertEqual(d['version'],156);self.assertEqual(d['mypaint']['surfacePolicy'],'krita-legacy-v1');self.assertEqual(len(d['mypaint']['settings']),2);setting=next(x for x in d['mypaint']['settings']if x['id']==63);self.assertEqual(setting,{'id':63,'base':.8,'inputs':[{'id':0,'points':[[0,-.2],[1,.2]]}]});validate_portable_profile(d);self.assertIn('native-ignored',record['compatibility'][0]['detail']);lib=cat.write();f=Path(t)/'own.grafetto-brushes.json';f.write_text(json.dumps({'library':lib,'assets':{}}));out=Catalog(Path(t)/'portable');portable_bundle(f,out);self.assertEqual(out.brushes,cat.brushes);self.assertEqual(out.assets,{})
 def test_old55_keyword_noop_exactidentity(self):
  with tempfile.TemporaryDirectory()as t:
   cat=Catalog(Path(t));raw=json.dumps(self.document(False)).encode();a=mypaint_preset(raw,'same.kpp',cat);b=mypaint_preset(raw,'same.kpp',cat,surface_policy='krita-legacy-v1');self.assertEqual(a,b);self.assertEqual(a['descriptor']['version'],55)
 def test_standalone_andbundle_MYB_staystrict(self):
  with tempfile.TemporaryDirectory()as t:
   cat=Catalog(Path(t)/'out');raw=json.dumps(self.document()).encode()
   with self.assertRaises(ValueError):mypaint_preset(raw,'own.myb',cat)
   f=Path(t)/'own.bundle'
   with zipfile.ZipFile(f,'w')as z:z.writestr('paintoppresets/own.myb',raw)
   convert_krita(f,cat);self.assertEqual(cat.brushes,[]);self.assertTrue(cat.skipped)
 def test_policy_revision_mapping_andchild_prestate_rejections(self):
  with tempfile.TemporaryDirectory()as t:d=preset(self.raw(),'SelfAuthored156.kpp',Catalog(Path(t)),{})['descriptor']
  for version in[55,155,157]:
   x=copy.deepcopy(d);x['version']=version
   with self.assertRaises(ValueError):validate_mypaint_legacy156(x)
  x=copy.deepcopy(d);x['mypaint']['surfacePolicy']='surface2'
  with self.assertRaises(ValueError):validate_mypaint_legacy156(x)
  with self.assertRaises(ValueError):validate_mypaint_legacy156(d,{})
  x=copy.deepcopy(d);x['mypaint']['settings'][0]['inputs']=[{'id':0,'points':[[1,0],[0,1]]}]
  with self.assertRaises(ValueError):validate_mypaint_legacy156(x)
