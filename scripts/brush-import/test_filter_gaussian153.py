"""Authored source-format Gaussian only; no vendor/stock claim."""
import unittest,io,copy,tempfile,json,base64
from pathlib import Path
from test_krita import kpp
from krita_import import convert_krita
import convert
class Gaussian153(unittest.TestCase):
 def native(self,root,x=16,y=0):
  params='<params><param name="horizRadius">'+str(x)+'</param><param name="vertRadius">'+str(y)+'</param></params>'
  p=root/'Own153.kpp';p.write_bytes(kpp(engine='filter',resources='<param name="Filter/id">gaussian blur</param><param name="Filter/smudgeMode">true</param><param name="Filter/configuration"><![CDATA['+params+']]></param>',mode='copy'));out=convert.Catalog(root/'out');convert_krita(p,out,{});return out
 def test_native_radii_policy_and_portable_closed_beforeoutputs(self):
  with tempfile.TemporaryDirectory()as t:
   r=Path(t);out=self.native(r);self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],153);self.assertEqual(d['filter']['spatialPolicy'],'gaussian-halo-v1');self.assertEqual((d['filter']['radiusX'],d['filter']['radiusY']),(16,0))
   env={'library':out.write(),'assets':{a:base64.b64encode((out.output/m['file']).read_bytes()).decode()for a,m in out.assets.items()}};f=r/'own.grafetto-brushes.json';f.write_text(json.dumps(env));good=convert.Catalog(r/'good');convert.portable_bundle(f,good);self.assertEqual(good.brushes,out.brushes)
   for case in('old','missing','unsharp','overflow','erase','dual'):
    bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
    if case=='old':b['version']=147
    elif case=='missing':b['filter'].pop('spatialPolicy')
    elif case=='unsharp':b['filter']['kind']='unsharp'
    elif case=='overflow':b['filter']['radiusX']=17
    elif case=='erase':b['behavior']['erase']=True
    else:b['behavior']['dual']={}
    f.write_text(json.dumps(bad));dest=convert.Catalog(r/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(f,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
