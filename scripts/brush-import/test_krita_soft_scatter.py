"""Authored squared-radius rings and native-axis placement witnesses."""
import math
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita,soft_circle
from test_krita import kpp


class SoftScatterTests(unittest.TestCase):
    def brush(self,definition,extra=''):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'Unrelated.kpp';p.write_bytes(kpp(definition,resources=extra,engine='colorsmudge'))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c);return c

    def test_default_curve_is_coverage_squared_radius_not_inverse(self):
        mask=soft_circle(diameter=60,size=257)
        self.assertEqual(mask.getpixel((128,128)),0)
        self.assertEqual(mask.getpixel((0,0)),0)
        # Point32px fromcenter inradius128.5: q=r². Native curve table242,
        # lookup240*q means effective identity argument240*q/241.
        q=(64/257)**2
        expected=255-int((1-q*240/241)*255)
        self.assertEqual(mask.getpixel((160,128)),expected)
        self.assertLess(expected,20) # inversecoverage would exceed230

    def test_nonmonotonic_ring_center_hole_peak_and_outer_fade(self):
        curve='0,0;.25,1,is_corner;1,0'
        image=soft_circle(curve,diameter=60,size=257)
        self.assertEqual(image.getpixel((128,128)),0)
        row=[image.getpixel((x,128)) for x in range(128,257)]
        peak=max(range(len(row)),key=row.__getitem__)
        self.assertTrue(60<=peak<=68) # peakradius~.5; C(r) wouldpeak~.25
        self.assertGreater(row[peak],245);self.assertLessEqual(row[-1],5)
        self.assertEqual(image.tobytes(),image.transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes())

    def test_stock_like_curve_retains_transparent_center_and_ring(self):
        image=soft_circle('0,0;.594377,.302325;.742972,.837209;.915663,.55814;1,0',60)
        self.assertEqual(image.getpixel((128,128)),0)
        self.assertGreater(max(image.tobytes()),200)
        self.assertLess(image.getpixel((255,128)),30)

    def test_supported_generator_routes_radial_and_unsupported_gates_are_visible(self):
        def definition(shape='circle',spikes=2,aa=0,extra=''):
            return '<Brush type="auto_brush" '+extra+'><MaskGenerator id="soft" type="'+shape+'" diameter="60" ratio=".5" spikes="'+str(spikes)+'" antialiasEdges="'+str(aa)+'" softness_curve="0,0;.25,1,is_corner;1,0"/></Brush>'
        c=self.brush(definition());self.assertEqual(c.skipped,[])
        d=c.brushes[0]['descriptor'];self.assertEqual(d['tip']['kind'],'procedural');self.assertEqual(d['tip']['aspect'],2)
        self.assertTrue(any(n['feature']=='radialCurveProfile' for n in c.brushes[0]['compatibility']))
        for args in [('rect',2,0,''),('circle',3,0,''),('circle',2,1,''),('circle',2,0,'randomness=".2"'),('circle',2,0,'density=".5"')]:
            c=self.brush(definition(*args));self.assertEqual(c.skipped,[])
            self.assertFalse(any(n['feature']=='radialCurveProfile' for n in c.brushes[0]['compatibility']))
            self.assertTrue(any(n['feature']=='autoBrush' and n['status']=='unsupported' for n in c.brushes[0]['compatibility']))

    def test_malformed_and_singular_profiles_fail_without_fabricating_shape(self):
        for curve in ['', '0,0;0,1;', '0,0;.0000000000001,1;', '0,nan;1,0;']:
            with self.subTest(curve=curve),self.assertRaises(ValueError):soft_circle(curve)
        for diameter in [0,-1,.001,math.inf,10001]:
            with self.subTest(diameter=diameter),self.assertRaises(ValueError):soft_circle(diameter=diameter)

    def test_axes_select_path_normal_or_independent_square_and_none_omits_scatter(self):
        definition='<Brush type="auto_brush"><MaskGenerator type="circle" ratio="1"/></Brush>'
        for x,y,placement in [('true','false','pathUniform'),('false','true','normalUniform'),('true','true','xyUniform'),('false','false',None)]:
            params={'PressureScatter':'true','ScatterValue':'.7','ScatterUseCurve':'false','Scattering/AxisX':x,'Scattering/AxisY':y}
            c=self.brush(definition,''.join('<param name="'+k+'">'+v+'</param>' for k,v in params.items()));self.assertEqual(c.skipped,[])
            d=c.brushes[0]['descriptor']
            if placement:
                self.assertEqual(d['behavior']['scatter']['placement'],placement)
                self.assertEqual(d['behavior']['scatter']['bothAxes'],placement=='xyUniform')
                self.assertEqual(d['scatter']['radius'],.7)
            else:self.assertNotIn('scatter',d);self.assertNotIn('scatter',d['behavior'])


if __name__=='__main__':unittest.main()
