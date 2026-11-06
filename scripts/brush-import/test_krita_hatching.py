from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class HatchingTests(unittest.TestCase):
    def convert(self,extra=''):
        data=kpp(engine='hatchingbrush',resources=extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_world_configuration(self):
        a=self.convert('<param name="Hatching/bool_nocrosshatching">false</param><param name="Hatching/bool_moirepattern">true</param><param name="Hatching/origin_x">12</param>');self.assertEqual(a['descriptor']['version'],47);self.assertEqual(a['descriptor']['hatching']['style'],'moire');self.assertEqual(a['descriptor']['hatching']['origin'],[12,50])
    def test_checked_cross_control_keeps_presence(self):
        a=self.convert('<param name="PressureCrosshatching">true</param><param name="CrosshatchingUseCurve">false</param>');self.assertIn('cross',a['descriptor']['hatching']['dynamics'])
    def test_opaque_background_and_invalid_geometry_rejected(self):
        with self.assertRaisesRegex(ValueError,'background'):self.convert('<param name="Hatching/bool_opaquebackground">true</param>')
        with self.assertRaisesRegex(ValueError,'separation'):self.convert('<param name="Hatching/separation">0</param>')
