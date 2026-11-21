import unittest,tempfile,copy,json,base64
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
import convert
class Healing152Tests(unittest.TestCase):
 def test_pixel_radial_aa_cannot_leak_into_clone_scope(self):
  definition='<Brush type="auto_brush"><MaskGenerator type="circle" ratio="1" diameter="24" id="soft" spikes="2" antialiasEdges="1" softness_curve="0,1;1,0;"/></Brush>'
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'clone.kpp';p.write_bytes(kpp(definition,engine='duplicate'));out=convert.Catalog(Path(tmp)/'native');convert_krita(p,out,{})
   self.assertEqual(out.skipped,[]);b=out.brushes[0];self.assertNotEqual(b['descriptor']['version'],199);self.assertTrue(any(x['feature']=='autoBrush' and x['status']=='unsupported' for x in b['compatibility']))
 def test_genuine_local_merged_mask_and_pressure_portable_root_scope(self):
  for merged in(False,True):
   with self.subTest(merged=merged),tempfile.TemporaryDirectory()as tmp:
    r=Path(tmp);p=r/'Own.kpp';p.write_bytes(kpp(engine='duplicate',resources='<param name="Duplicateop/Healing">true</param><param name="Duplicateop/CloneFromProjection">'+str(merged).lower()+'</param><param name="PressureSize">true</param>'));out=convert.Catalog(r/'native');convert_krita(p,out,{});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],152);self.assertEqual(d['clone']['healing'],'lab-ratio-v1');self.assertEqual(d['clone']['sourcePolicy'],'canonical-begin-v1');self.assertEqual('source'in d['clone'],merged);self.assertNotEqual(d['sizeByPressure'],[[0,1],[1,1]])
    env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=r/'own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(r/'portable');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
    for key in('old','missingPolicy','wrongHealing','erase','dual','animation','texture','timer'):
     bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
     if key=='old':b['version']=151
     elif key=='missingPolicy':b['clone'].pop('sourcePolicy')
     elif key=='wrongHealing':b['clone']['healing']=True
     elif key=='erase':b['behavior']['erase']=True
     elif key=='dual':b['behavior']['dual']={}
     elif key=='animation':b['tip']['animation']={}
     elif key=='texture':b['texture']={}
     else:b['behavior']['timing']={}
     path.write_text(json.dumps(bad));dest=convert.Catalog(r/key)
     with self.subTest(key=key),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
     self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
