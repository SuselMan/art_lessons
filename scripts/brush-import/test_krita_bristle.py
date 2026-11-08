from pathlib import Path
import tempfile,unittest,struct
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class BristleTests(unittest.TestCase):
    def convert(self,extra='',aa=True):
        definition='<Brush type="gbr_brush" filename="hair.gbr" scale="1" ColorAsMask="1"/>'
        data=kpp(engine='hairybrush',definition=definition,resources='<param name="HairyBristle/antialias">'+str(aa).lower()+'</param>'+extra)
        # GIMP grayscale brush, white represents coverage in the importer.
        name=b'hair\0';header=struct.pack('>7I',28+len(name),2,4,4,1,0x47494d50,25)
        with tempfile.TemporaryDirectory() as d:return preset(data,'test.kpp',Catalog(Path(d)),{'hair.gbr':header+name+bytes([255]*16)})
    def test_population_is_fixed_and_bounded(self):
        a=self.convert();b=self.convert();self.assertEqual(a['descriptor'],b['descriptor']);self.assertEqual(a['descriptor']['version'],143);self.assertEqual(len(a['descriptor']['bristle']['hairs']),16)
    def test_soak_is_explicit_new139_not_reinterpreted_old72(self):
        d=self.convert('<param name="HairyInk/enabled">true</param><param name="HairyInk/soak">true</param><param name="HairyInk/inkAmount">4</param>')['descriptor']
        self.assertEqual(d['version'],140);self.assertEqual(d['bristle']['soak'],{'sourcePolicy':'canonical-begin-v1','initialSide':4,'resizePolicy':'mask-population-v1'})
        old=self.convert('<param name="HairyInk/enabled">true</param><param name="HairyInk/inkAmount">4</param>')['descriptor']
        self.assertEqual(old['version'],72);self.assertNotIn('soak',old['bristle'])
    def test_signed_scale_retains_authored_noink_geometry_but_not_ink_scope(self):
        d=self.convert('<param name="HairyBristle/scale">-0.78</param>')['descriptor']
        self.assertEqual(d['bristle']['scale'],-.78)
        with self.assertRaisesRegex(ValueError,'scale'):self.convert('<param name="HairyInk/enabled">true</param><param name="HairyBristle/scale">-0.78</param>')

    def test_density_is_checked(self):
        with self.assertRaisesRegex(ValueError,'density'):self.convert('<param name="HairyBristle/density">101</param>')

    def test_aliased_alpha_winner_is_admitted_separately_from_legacy(self):
        b=self.convert('<param name="HairyBristle/useCompositing">false</param>',aa=False)['descriptor']
        self.assertEqual(b['version'],143);self.assertFalse(b['bristle']['antialias']);self.assertFalse(b['bristle']['compositing'])

    def test_opacity_depletion_and_native_weight_units(self):
        d=self.convert('<param name="HairyInk/enabled">true</param><param name="HairyInk/inkAmount">4</param><param name="HairyInk/pressureWeights">25</param><param name="HairyInk/inkDepletionWeight">70</param>')['descriptor']
        self.assertEqual(d['version'],72);self.assertEqual(d['bristle']['version'],2)
        ink=d['bristle']['ink'];self.assertEqual(len(ink['depletion']),4)
        self.assertEqual(ink['pressureWeight'],.25);self.assertEqual(ink['inkDepletionWeight'],70)
        self.assertTrue(ink['useOpacity']);self.assertFalse(ink['useSaturation'])
    def test_invalid_amount_remains_explicit(self):
        for key,value in [('inkAmount','1'),('inkAmount','65537')]:
            with self.assertRaises(ValueError):self.convert('<param name="HairyInk/enabled">true</param><param name="HairyInk/'+key+'">'+value+'</param>')

    def test_saturation_uses_trusted_compiler_and_revision93(self):
        from unittest.mock import patch
        lookup={'version':1,'encoding':'bristle-saturation-functional-v1-le','asset':'asset:'+'a'*64,'profileSha256':'b'*64,'byteLength':80}
        with patch('captured_bristle.install_bristle',return_value=(lookup,{}))as compile:
            result=self.convert('<param name="HairyInk/enabled">true</param><param name="HairyInk/useSaturation">true</param><param name="HairyInk/inkAmount">4</param>')
        d=result['descriptor'];self.assertEqual(d['version'],93);self.assertEqual(d['bristle']['saturationLookup'],lookup)
        self.assertTrue(d['bristle']['ink']['useSaturation']);compile.assert_called_once()
        self.assertEqual(compile.call_args.args[0],d['bristle']['ink'])
        self.assertTrue(any(n['feature']=='bristleSaturation' for n in result['compatibility']))
