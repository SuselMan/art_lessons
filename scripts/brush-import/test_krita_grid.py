from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class GridTests(unittest.TestCase):
    def convert(self,extra=''):
        data=kpp(engine='gridbrush',resources='<param name="Grid/gridWidth">20</param><param name="Grid/gridHeight">20</param><param name="Grid/divisionLevel">0</param>'+extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_legacy_diameter_and_point_source(self):
        a=self.convert('<param name="ColorOption/sampleInputColor">true</param>');self.assertEqual(a['descriptor']['version'],48);self.assertEqual(a['sourceDefaults']['sizePx'],20);self.assertEqual(a['descriptor']['mixer']['source'],'previousCanvas');self.assertFalse(a['descriptor']['grid']['colorPerCell'])
    def test_plain_foreground_grid_stays_supported(self):
        a=self.convert();self.assertNotIn('source',a['descriptor']['mixer']);self.assertEqual(a['descriptor']['mixer']['load'],1)
    def test_background_hsv_and_invalid_shape_rejected(self):
        with self.assertRaisesRegex(ValueError,'background'):self.convert('<param name="ColorOption/fillBackground">true</param>')
        with self.assertRaisesRegex(ValueError,'HSV'):self.convert('<param name="ColorOption/useRandomHSV">true</param><param name="ColorOption/hue">10</param>')
        with self.assertRaisesRegex(ValueError,'shape'):self.convert('<param name="GridShape/shape">10</param>')
