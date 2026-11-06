from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class FilterTests(unittest.TestCase):
    def convert(self,kind='gaussian blur',extra=''):
        data=kpp(engine='filter',mode='copy',resources='<param name="Filter/id">'+kind+'</param>'+extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'filter.kpp',Catalog(Path(d)),{})
    def test_factory_defaults(self):
        blur=self.convert()['descriptor'];sharp=self.convert('unsharp')['descriptor'];self.assertEqual(blur['filter']['radiusX'],5);self.assertEqual(sharp['filter']['radiusX'],1);self.assertEqual(sharp['filter']['amount'],.5);self.assertEqual(blur['mixer']['source'],'previousCanvas');self.assertEqual(blur['version'],52)
    def test_config_and_rejections(self):
        extra='<param name="Filter/configuration"><![CDATA[<params><param name="horizRadius">0</param><param name="vertRadius">8</param></params>]]></param>'
        f=self.convert(extra=extra)['descriptor']['filter'];self.assertEqual((f['radiusX'],f['radiusY']),(0,8))
        with self.assertRaisesRegex(ValueError,'smudge'):self.convert(extra='<param name="Filter/smudgeMode">true</param>')
        with self.assertRaisesRegex(ValueError,'Unsupported'):self.convert('unknown')
