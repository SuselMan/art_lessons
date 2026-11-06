from pathlib import Path
import tempfile,unittest,struct
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class BristleTests(unittest.TestCase):
    def convert(self,extra=''):
        definition='<Brush type="gbr_brush" filename="hair.gbr" scale="1" ColorAsMask="1"/>'
        data=kpp(engine='hairybrush',definition=definition,resources='<param name="HairyBristle/antialias">true</param>'+extra)
        # GIMP grayscale brush, white represents coverage in the importer.
        name=b'hair\0';header=struct.pack('>7I',28+len(name),2,4,4,1,0x47494d50,25)
        with tempfile.TemporaryDirectory() as d:return preset(data,'test.kpp',Catalog(Path(d)),{'hair.gbr':header+name+bytes([255]*16)})
    def test_population_is_fixed_and_bounded(self):
        a=self.convert();b=self.convert();self.assertEqual(a['descriptor'],b['descriptor']);self.assertEqual(a['descriptor']['version'],45);self.assertEqual(len(a['descriptor']['bristle']['hairs']),16)
    def test_depletion_and_soak_rejected(self):
        with self.assertRaisesRegex(ValueError,'depletion'):self.convert('<param name="HairyInk/enabled">true</param><param name="HairyInk/soak">true</param>')
    def test_density_is_checked(self):
        with self.assertRaisesRegex(ValueError,'density'):self.convert('<param name="HairyBristle/density">101</param>')
