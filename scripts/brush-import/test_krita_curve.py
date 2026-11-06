from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class CurveTests(unittest.TestCase):
    def convert(self,extra=''):
        data=kpp(engine='curvebrush',resources='<param name="Curve/lineWidth">4</param><param name="Curve/smoothing">true</param>'+extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_configuration_and_size_default(self):
        a=self.convert();self.assertEqual(a['descriptor']['version'],46);self.assertEqual(a['descriptor']['curveTrace']['history'],12);self.assertEqual(a['sourceDefaults']['sizePx'],4);self.assertEqual(a['descriptor']['sizeByPressure'],[[0,1],[1,1]])
    def test_active_sensor_import(self):
        a=self.convert('<param name="PressureLine width">true</param><param name="Line widthUseCurve">false</param><param name="Line widthValue">0.5</param>');self.assertEqual(a['descriptor']['curveTrace']['dynamics']['width'][0]['curve'],[[0,.5],[1,.5]])
    def test_history_and_timer_are_bounded(self):
        with self.assertRaisesRegex(ValueError,'[hH]istory'):self.convert('<param name="Curve/strokeHistorySize">1</param>')
        with self.assertRaisesRegex(ValueError,'timed'):self.convert('<param name="PaintOpSettings/isAirbrushing">true</param>')
