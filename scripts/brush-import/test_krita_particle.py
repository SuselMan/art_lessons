from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class ParticleTests(unittest.TestCase):
    def convert(self,extra=''):
        data=kpp(engine='particlebrush',resources=extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_solver_defaults(self):
        a=self.convert();self.assertEqual(a['descriptor']['version'],49);self.assertEqual(a['descriptor']['particle']['count'],50);self.assertEqual(a['descriptor']['particle']['gravity'],.989)
    def test_population_budget_and_unstable_modes_rejected(self):
        with self.assertRaisesRegex(ValueError,'budget'):self.convert('<param name="Particle/count">500</param><param name="Particle/iterations">200</param>')
        with self.assertRaisesRegex(ValueError,'scaleX'):self.convert('<param name="Particle/scaleX">-1</param>')
    def test_both_timer_keys_are_checked(self):
        for k in ('AirbrushOption/isAirbrushing','PaintOpSettings/isAirbrushing'):
            with self.assertRaisesRegex(ValueError,'timed'):self.convert('<param name="'+k+'">true</param>')
