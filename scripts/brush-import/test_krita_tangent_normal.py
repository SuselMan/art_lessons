from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset

class TangentNormalTests(unittest.TestCase):
    def convert(self,extra=''):
        with tempfile.TemporaryDirectory()as d:return preset(kpp(engine='tangentnormal',resources=extra),'normal.kpp',Catalog(Path(d)),{})
    def test_default_and_swizzles(self):
        d=self.convert()['descriptor'];self.assertEqual(d['tangentNormal'],{'version':1,'direction':'tilt','channels':[0,2,4],'elevationSensitivity':1,'mix':.5});self.assertEqual(d['behavior']['rendering']['accumulation'],'directOver')
        d=self.convert('<param name="Tangent/directionType">3</param><param name="Tangent/swizzleGreen">3</param><param name="Tangent/elevationSensitivity">25</param>')['descriptor']
        self.assertEqual(d['tangentNormal']['direction'],'mix');self.assertEqual(d['tangentNormal']['channels'],[0,3,4]);self.assertEqual(d['tangentNormal']['elevationSensitivity'],.25)
    def test_invalid_and_missing_sensor(self):
        for key,value in [('directionType','2'),('directionType','1.5'),('swizzleRed','6'),('mixValue','nan'),('elevationSensitivity','-1')]:
            with self.assertRaises(ValueError):self.convert('<param name="Tangent/'+key+'">'+value+'</param>')
