import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image, PngImagePlugin
from brush_contract import Catalog
from krita_import import preset
from krita_spray import inverse_cdf

class SprayTest(unittest.TestCase):
    def make(self,extra=''):
        meta=PngImagePlugin.PngInfo();meta.add_text('preset','<Preset paintopid="spraybrush" name="Test"><param name="Spray/diameter">100</param><param name="Spray/particleCount">12</param><param name="SprayShape/enabled">true</param><param name="SprayShape/width">6</param><param name="SprayShape/height">4</param>'+extra+'</Preset>');b=io.BytesIO();Image.new('RGBA',(4,4),'white').save(b,format='PNG',pnginfo=meta);return b.getvalue()
    def convert(self,extra=''):
        with tempfile.TemporaryDirectory() as d:return preset(self.make(extra),'test.kpp',Catalog(Path(d)),{})
    def test_separate_area_and_particle(self):
        b=self.convert();self.assertEqual(b['descriptor']['version'],43);self.assertEqual(b['sourceDefaults']['sizePx'],100);self.assertEqual(b['descriptor']['spray']['particle'],{'shape':'ellipse','width':6,'height':4,'proportional':False})
    def test_soft_spray_tip_keeps_its_curve_with_aa_and_random_coverage(self):
        import xml.etree.ElementTree as ET
        im=Image.open(io.BytesIO(self.make()));im.load();root=ET.fromstring(im.info['preset'])
        next(p for p in root.findall('param') if p.get('name')=='SprayShape/enabled').text='false'
        ET.SubElement(root,'param',{'name':'brush_definition'}).text='<Brush type="auto_brush" density="0.5" randomness="0.23"><MaskGenerator id="soft" diameter="80" ratio="1" type="circle" spikes="2" antialiasEdges="1" softness_curve="0,0;0.8,1;1,0;"/></Brush>'
        info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=info)
        with tempfile.TemporaryDirectory() as d:b=preset(out.getvalue(),'ring.kpp',Catalog(Path(d)),{})
        self.assertEqual(b['descriptor']['tip']['profile']['kind'],'radialCurve')
        self.assertTrue(any(n['feature']=='sprayTipRandomness' for n in b['compatibility']))
    def test_distribution_encodings(self):
        b=self.convert();s=b['descriptor']['spray'];self.assertEqual(len(s['radial']['samples']),1028);self.assertEqual(len(s['angular']),1028)
    def test_area_uniform_pdf(self):
        a=inverse_cdf(lambda x:2*x);self.assertAlmostEqual(a[64],.5,places=5)
    def test_missing_canvas_strategy_is_explicit(self):
        for key in ['sampleInputColor','mixBgColor','fillBackground']:
            with self.assertRaisesRegex(ValueError,'canvas colour'):self.convert('<param name="ColorOption/'+key+'">true</param>')
    def test_filesystem_image_not_followed(self):
        with self.assertRaisesRegex(ValueError,'image shape'):self.convert('<param name="SprayShape/shape">4</param>')
    def test_invalid_distribution_rejected(self):
        with self.assertRaisesRegex(ValueError,'radial distribution'):self.convert('<param name="Spray/radialDistributionType">bad</param>')
    def test_no_probability_rejected(self):
        with self.assertRaisesRegex(ValueError,'probability mass'):inverse_cdf(lambda x:0)
