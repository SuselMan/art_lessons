import unittest,tempfile,json,copy,base64
from pathlib import Path
from test_bristle_initialization141 import Initialization141
from bristle_soak139 import bristle_source143_scope,bristle_resize141_scope
from brush_contract import Catalog
from convert import portable_bundle
class Source143(unittest.TestCase):
 def test_original_cas_rect_and_q16_rotation_and_portable_resources(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=Initialization141().native(tmp);d=c.brushes[0]['descriptor'];i=d['bristle']['initialization'];self.assertEqual(d['version'],143);self.assertTrue(bristle_source143_scope(d));self.assertFalse(bristle_resize141_scope(d));self.assertEqual(i['sourceBounds'],{'x':0,'y':0,'width':4,'height':4});self.assertEqual(i['rotation'],[65536,0]);self.assertIn(i['sourceMask'],c.assets)
   env={'library':c.write(),'assets':{k:base64.b64encode((c.output/a['file']).read_bytes()).decode()for k,a in c.assets.items()}};p=Path(tmp)/'source.grafetto-brushes.json'
   for case in('valid','missing','side','rotation','bounds','downgrade'):
    e=copy.deepcopy(env);a=e['library']['brushes'][0]['descriptor']['bristle']['initialization']
    if case=='missing':a['sourceMask']='asset:'+'0'*64
    elif case=='side':a['sourceSide']=8
    elif case=='rotation':a['rotation']=[0,0]
    elif case=='bounds':a['sourceBounds']['width']=5
    elif case=='downgrade':e['library']['brushes'][0]['descriptor']['version']=142
    p.write_text(json.dumps(e));out=Catalog(Path(tmp)/case)
    if case=='valid':portable_bundle(p,out);self.assertEqual(out.brushes,c.brushes)
    else:
     with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,out)
     self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{})
