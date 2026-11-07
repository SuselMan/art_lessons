from pathlib import Path
import tempfile,unittest,json,copy
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
class FilterInvert95Tests(unittest.TestCase):
    def convert(self,configuration='',extra=''):
        params='<param name="Filter/id">invert</param>'+extra
        if configuration:params+='<param name="Filter/configuration"><![CDATA[<params>'+configuration+'</params>]]></param>'
        data=kpp(engine='filter',mode='copy',resources=params)
        with tempfile.TemporaryDirectory()as folder:return preset(data,'invert.kpp',Catalog(Path(folder)),{})
    def test_native_invert_ignores_unused_configuration_five_genuine_kpps(self):
        baseline=self.convert();expected={k:v for k,v in baseline['descriptor'].items()if k!='id'}
        for cfg in ('','<param name="horizRadius">0</param>','<param name="horizRadius">16</param><param name="vertRadius">8</param>','<param name="halfSize">not a number</param><param name="amount">NaN</param>','<param name="nativeUnused">kept only in source bytes</param>'):
            with self.subTest(cfg=cfg):
                result=self.convert(cfg);self.assertEqual({k:v for k,v in result['descriptor'].items()if k!='id'},expected)
                self.assertEqual(result['descriptor']['version'],95);self.assertEqual(result['descriptor']['filter'],{'version':2,'kind':'invert'})
        self.assertEqual(baseline['descriptor']['mixer']['source'],'previousCanvas')
    def test_existing_safety_guards_not_relaxed(self):
        for key,value in [('Filter/smudgeMode','true'),('EraserMode','true'),('PaintOpSettings/isAirbrushing','true')]:
            with self.subTest(key=key),self.assertRaises(ValueError):self.convert(extra='<param name="'+key+'">'+value+'</param>')
    def test_portable_preserves_exact_descriptor(self):
        result=self.convert();library={'schemaVersion':1,'brushes':[result],'assets':[],'skipped':[]}
        with tempfile.TemporaryDirectory()as folder:
            path=Path(folder)/'invert.grafetto-brushes.json';path.write_text(json.dumps({'library':library,'assets':{}}));catalog=Catalog(Path(folder)/'output');portable_bundle(path,catalog);self.assertEqual(catalog.brushes,[result])
