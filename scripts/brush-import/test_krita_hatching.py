from pathlib import Path
import tempfile,unittest,io
from PIL import Image,PngImagePlugin
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class HatchingTests(unittest.TestCase):
    def test_noise_is_explicitly_skipped_instead_of_an_invalid_descriptor(self):
        definition='<Brush type="auto_brush" density=".44" randomness="1"><MaskGenerator id="default" type="circle" ratio="1" hfade=".5" vfade=".5" diameter="25" spikes="2" antialiasEdges="0"/></Brush>'
        data=kpp(engine='hatchingbrush',definition=definition)
        with tempfile.TemporaryDirectory() as d, self.assertRaisesRegex(ValueError,'Hatching procedural mask noise'):
            preset(data,'noise.kpp',Catalog(Path(d)),{})
    def convert(self,extra=''):
        data=kpp(engine='hatchingbrush',resources=extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_text_icc_metadata_does_not_abort_bundle(self):
        source=Image.open(io.BytesIO(kpp(engine='hatchingbrush')))
        metadata=PngImagePlugin.PngInfo()
        metadata.add_text('preset',source.info['preset'])
        metadata.add_text('icc_profile','legacy text, not an ICC profile')
        output=io.BytesIO();source.save(output,format='PNG',pnginfo=metadata)
        with tempfile.TemporaryDirectory() as d:
            result=preset(output.getvalue(),'test.kpp',Catalog(Path(d)),{})
        self.assertIn('hatching',result['descriptor'])
    def test_world_configuration(self):
        a=self.convert('<param name="Hatching/bool_nocrosshatching">false</param><param name="Hatching/bool_moirepattern">true</param><param name="Hatching/origin_x">12</param>');self.assertEqual(a['descriptor']['version'],47);self.assertEqual(a['descriptor']['hatching']['style'],'moire');self.assertEqual(a['descriptor']['hatching']['origin'],[12,50])
    def test_checked_cross_control_keeps_presence(self):
        a=self.convert('<param name="PressureCrosshatching">true</param><param name="CrosshatchingUseCurve">false</param>');self.assertIn('cross',a['descriptor']['hatching']['dynamics']);self.assertFalse(any(n['status']=='unsupported' and 'PressureCrosshatching' in n['detail'] for n in a['compatibility']))
    def test_opaque_background_and_invalid_geometry_rejected(self):
        d=self.convert('<param name="Hatching/bool_opaquebackground">true</param>')['descriptor']
        self.assertTrue(d['hatching']['opaqueBackground']);self.assertEqual(d['version'],67)
        with self.assertRaisesRegex(ValueError,'separation'):self.convert('<param name="Hatching/separation">0</param>')
