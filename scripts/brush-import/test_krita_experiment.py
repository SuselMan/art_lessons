from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class ExperimentTests(unittest.TestCase):
    def convert(self,extra=''):
        data=kpp(engine='experimentbrush',resources=extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_fill_settings(self):
        a=self.convert('<param name="Experiment/windingFill">true</param><param name="Experiment/smoothing">true</param>');self.assertEqual(a['descriptor']['version'],50);self.assertTrue(a['descriptor']['experiment']['winding']);self.assertTrue(a['descriptor']['experiment']['smoothingEnabled'])
    def test_pattern_and_invalid_controls_rejected(self):
        with self.assertRaisesRegex(ValueError,'pattern'):self.convert('<param name="Experiment/fillType">1</param>')
        with self.assertRaisesRegex(ValueError,'speed'):self.convert('<param name="Experiment/speed">101</param>')
