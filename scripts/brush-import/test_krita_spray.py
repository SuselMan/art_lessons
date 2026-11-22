import io
import tempfile
import unittest
from pathlib import Path
from PIL import Image, PngImagePlugin
from brush_contract import Catalog
from krita_import import preset as public_preset
from krita_spray import inverse_cdf, spray_preset


def preset(data, name, catalog, external):
    # These tests exercise the legacy standalone Spray adapter and its old
    # descriptor revisions. The public importer now promotes eligible presets
    # to native whole-role revision 194/195, covered by test_sketch_spray194.
    import xml.etree.ElementTree as ET
    image=Image.open(io.BytesIO(data));image.load()
    root=ET.fromstring(image.info['preset'])
    params={node.get('name'):node.text or '' for node in root.findall('param')}
    return spray_preset(data,root,params,name,catalog,external)

class SprayTest(unittest.TestCase):
    def make(self,extra=''):
        if 'name="PaintOpAction"' not in extra:extra='<param name="PaintOpAction">1</param>'+extra
        meta=PngImagePlugin.PngInfo();meta.add_text('preset','<Preset paintopid="spraybrush" name="Test"><param name="Spray/diameter">100</param><param name="Spray/particleCount">12</param><param name="SprayShape/enabled">true</param><param name="SprayShape/width">6</param><param name="SprayShape/height">4</param>'+extra+'</Preset>');b=io.BytesIO();Image.new('RGBA',(4,4),'white').save(b,format='PNG',pnginfo=meta);return b.getvalue()
    def convert(self,extra=''):
        with tempfile.TemporaryDirectory() as d:return preset(self.make(extra),'test.kpp',Catalog(Path(d)),{})
    def test_native_spray_scale_range(self):
        import convert
        for value in ('4.1','10'):
            brush=self.convert('<param name="Spray/scale">'+value+'</param>')
            self.assertEqual(brush['descriptor']['spray']['scale'],float(value))
            convert.validate_portable_profile(brush['descriptor'])
        with self.assertRaisesRegex(ValueError,'Spray/scale'):
            self.convert('<param name="Spray/scale">10.01</param>')
    def test_large_native_spacing_is_retained_in_source_profile(self):
        for value in (4.6, 5):
            brush=self.convert(f'<param name="Spray/spacing">{value}</param>')
            self.assertEqual(brush['descriptor']['spacing'],2)
            self.assertAlmostEqual(brush['descriptor']['behavior']['spacing']['coefficient'],value/2)
            with tempfile.TemporaryDirectory() as directory:
                actual=public_preset(self.make(f'<param name="Spray/spacing">{value}</param>'),'public.kpp',Catalog(Path(directory)),{})
            self.assertAlmostEqual(actual['descriptor']['behavior']['spacing']['coefficient'],value/2)
        with self.assertRaisesRegex(ValueError,'Spray/spacing'):
            self.convert('<param name="Spray/spacing">10.01</param>')
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
        self.assertEqual(b['descriptor']['version'],96)
        self.assertEqual(b['descriptor']['tip']['autoNoise'],{'version':1,'density':.5,'randomness':.23})
        self.assertFalse(any(n['feature']=='sprayTipRandomness' for n in b['compatibility']))
    def test_auto_noise_density_endpoints_and_source_combination(self):
        import xml.etree.ElementTree as ET
        for density in (0,1):
            im=Image.open(io.BytesIO(self.make()));im.load();root=ET.fromstring(im.info['preset'])
            next(p for p in root.findall('param') if p.get('name')=='SprayShape/enabled').text='false'
            ET.SubElement(root,'param',{'name':'brush_definition'}).text='<Brush type="auto_brush" density="'+str(density)+'" randomness="1"><MaskGenerator id="default" diameter="40" ratio="1" type="circle" spikes="2" antialiasEdges="1" hfade="1" vfade="1"/></Brush>'
            def encode():
                info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=info);return out.getvalue()
            with tempfile.TemporaryDirectory() as d:b=preset(encode(),'noise.kpp',Catalog(Path(d)),{})
            self.assertEqual(b['descriptor']['version'],96);self.assertEqual(b['descriptor']['tip']['autoNoise']['density'],density)
            self.assertEqual(b['descriptor']['spray']['count'],12)
            ET.SubElement(root,'param',{'name':'ColorOption/sampleInputColor'}).text='true'
            with tempfile.TemporaryDirectory() as d:
                with self.assertRaisesRegex(ValueError,'sampled source'):preset(encode(),'noise-source.kpp',Catalog(Path(d)),{})
    def test_portable_auto_noise_records_and_revision_boundaries(self):
        import copy
        import convert
        import xml.etree.ElementTree as ET
        im=Image.open(io.BytesIO(self.make()));im.load();root=ET.fromstring(im.info['preset'])
        next(p for p in root.findall('param') if p.get('name')=='SprayShape/enabled').text='false'
        ET.SubElement(root,'param',{'name':'brush_definition'}).text='<Brush type="auto_brush" density="0.5" randomness="0.3"><MaskGenerator id="default" diameter="40" ratio="1" type="circle" spikes="2" antialiasEdges="1" hfade="1" vfade="1"/></Brush>'
        info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=info)
        with tempfile.TemporaryDirectory() as directory:d=preset(out.getvalue(),'portable-noise.kpp',Catalog(Path(directory)),{})['descriptor']
        self.assertEqual(d['version'],96);self.assertEqual(d['spray']['particle']['shape'],'tip');convert.validate_portable_profile(d)
        invalid=[]
        bad=copy.deepcopy(d);bad['version']=95;invalid.append(bad)
        for key in ('sampleInput','mixBackground','fillBackground'):
            bad=copy.deepcopy(d);bad['spray']['color'][key]=True;invalid.append(bad)
        bad=copy.deepcopy(d);bad['behavior']['dual']={};invalid.append(bad)
        bad=copy.deepcopy(d);bad['spray']['particle']['image']=True;invalid.append(bad)
        for value in ([],None,7):
            bad=copy.deepcopy(d);bad['spray']=value
            invalid.append(bad)
            for key in ('particle','color'):
                bad=copy.deepcopy(d);bad['spray'][key]=value;invalid.append(bad)
            bad=copy.deepcopy(d);bad['behavior']=value;invalid.append(bad)
        for bad in invalid:
            with self.subTest(spray=bad.get('spray'),behavior=bad.get('behavior'),version=bad['version']):
                with self.assertRaises(ValueError):convert.validate_portable_profile(bad)
    def test_distribution_encodings(self):
        b=self.convert();s=b['descriptor']['spray'];self.assertEqual(len(s['radial']['samples']),1028);self.assertEqual(len(s['angular']),1028)
    def test_area_uniform_pdf(self):
        a=inverse_cdf(lambda x:2*x);self.assertAlmostEqual(a[64],.5,places=5)
    def test_curve_distributions_accept_identity_transfer(self):
        for axis in ['radial','angular']:
            b=self.convert('<param name="Spray/'+axis+'DistributionType">curveBased</param>')
            self.assertEqual(b['descriptor']['version'],43)
    def test_canvas_strategy_keeps_explicit_source_timing_qualification(self):
        for key in ['sampleInputColor','mixBgColor','fillBackground']:
            b=self.convert('<param name="ColorOption/'+key+'">true</param>')
            self.assertEqual(b['descriptor']['version'],146 if key=='sampleInputColor' else 76)
            if key=='sampleInputColor':self.assertEqual(b['descriptor']['spray']['color']['sourcePolicy'],'canonical-begin-v1')
            else:self.assertNotIn('sourcePolicy',b['descriptor']['spray']['color'])
            field={'sampleInputColor':'sampleInput','mixBgColor':'mixBackground','fillBackground':'fillBackground'}[key]
            self.assertTrue(b['descriptor']['spray']['color'][field])
            self.assertEqual(any(n['feature']=='spraySourceTiming'and n['status']=='approximate'for n in b['compatibility']),key=='sampleInputColor')
    def test_filesystem_image_not_followed(self):
        with self.assertRaisesRegex(ValueError,'image shape'):self.convert('<param name="SprayShape/shape">4</param>')
    def test_invalid_distribution_rejected(self):
        with self.assertRaisesRegex(ValueError,'radial distribution'):self.convert('<param name="Spray/radialDistributionType">bad</param>')
    def test_no_probability_rejected(self):
        with self.assertRaisesRegex(ValueError,'probability mass'):inverse_cdf(lambda x:0)
