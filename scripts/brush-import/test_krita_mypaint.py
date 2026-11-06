from pathlib import Path
import tempfile,json,unittest,base64,math
from test_krita import kpp
from brush_contract import Catalog
from mypaint_import import mypaint_preset
from krita_import import preset
class MyPaintTests(unittest.TestCase):
    def convert(self,settings):
        with tempfile.TemporaryDirectory()as d:return mypaint_preset(json.dumps({'version':3,'settings':settings}).encode(),'a.myb',Catalog(Path(d)))
    def test_raw_sensor_curves(self):
        d=self.convert({'radius_logarithmic':{'base_value':2,'inputs':{'pressure':[[0,-1],[1,0]]}}})['descriptor'];self.assertEqual(d['version'],55);self.assertAlmostEqual(d['mypaint']['baseRadius'],math.exp(2));self.assertEqual(d['mypaint']['settings'][0]['inputs'][0]['id'],0)
    def test_kpp_bytearray(self):
        encoded=base64.b64encode(json.dumps({'version':3,'settings':{}}).encode()).decode();data=kpp(engine='mypaintbrush',resources='<param name="MyPaint/json" type="bytearray">'+encoded+'</param>')
        with tempfile.TemporaryDirectory()as d:out=preset(data,'a.kpp',Catalog(Path(d)),{})
        self.assertEqual(out['descriptor']['mypaint']['kernel'],'libmypaint-1.6.1')
    def test_rejections(self):
        for key,value in [('unknown',0),('paint_mode',1)]:
            with self.assertRaises(ValueError):self.convert({key:{'base_value':value,'inputs':{}}})
        with self.assertRaises(ValueError):self.convert({'hardness':{'base_value':.5,'inputs':{'pressure':[[1,0],[0,1]]}}})
