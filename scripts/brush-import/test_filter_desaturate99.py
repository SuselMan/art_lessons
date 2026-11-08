from pathlib import Path
import tempfile,unittest,json,copy
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
class FilterDesaturate99Tests(unittest.TestCase):
 def convert(self,cfg=''):
  params='<param name="Filter/id">desaturate</param><param name="Filter/configuration"><![CDATA[<params>'+cfg+'</params>]]></param>'
  with tempfile.TemporaryDirectory()as folder:return preset(kpp(engine='filter',mode='copy',resources=params),'desaturate.kpp',Catalog(Path(folder)),{})
 def test_six_native_types_and_absent_default_preserve_unused_configuration(self):
  for t in range(6):
   result=self.convert('<param name="type">'+str(t)+'</param>');d=result['descriptor'];self.assertEqual(d['version'],99);self.assertEqual(d['filter'],{'version':2,'kind':'desaturate','type':t});self.assertEqual(d['mixer']['source'],'previousCanvas')
   extra=self.convert('<param name="type">'+str(t)+'</param><param name="halfSize">invalid unused</param><param name="amount">NaN</param>');self.assertEqual({k:v for k,v in extra['descriptor'].items()if k!='id'},{k:v for k,v in d.items()if k!='id'})
  self.assertEqual(self.convert()['descriptor']['filter']['type'],0)
 def test_invalid_type_and_duplicate_are_explicit_not_defaulted(self):
  for v in ['-1','6','.5','NaN','Infinity','invalid','']:
   with self.subTest(v=v),self.assertRaises(ValueError):self.convert('<param name="type">'+v+'</param>')
  with self.assertRaises(ValueError):self.convert('<param name="type">0</param><param name="type">1</param>')
 def test_portable_positive_and_revision_shape_and_root_only_rejections_before_output(self):
  brush=self.convert();portable={'library':{'schemaVersion':1,'brushes':[brush],'assets':[],'skipped':[]},'assets':{}}
  with tempfile.TemporaryDirectory()as folder:
   p=Path(folder)/'b.grafetto-brushes.json';p.write_text(json.dumps(portable));c=Catalog(Path(folder)/'good');portable_bundle(p,c);self.assertEqual(c.brushes,[brush])
   for case in ['below99','extra','type6','bool','child']:
    bad=copy.deepcopy(portable);d=bad['library']['brushes'][0]['descriptor']
    if case=='below99':d['version']=98
    elif case=='extra':d['filter']['radiusX']=0
    elif case=='type6':d['filter']['type']=6
    elif case=='bool':d['filter']['type']=True
    else:
     child=copy.deepcopy(d);d.pop('filter');d.pop('mixer');d['model']='stamp';d['behavior']['dual']={'brush':child,'blendMode':'multiply'}
    p.write_text(json.dumps(bad));c=Catalog(Path(folder)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(p,c)
    self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{});self.assertEqual(list(c.output.iterdir()),[])
