"""Authored native-grid textures, independently known expected asset bytes."""
import io
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp


class TextureImportTests(unittest.TestCase):
    def imported(self, tmp, extra=None, size=(3,2)):
        image=Image.new('L',size);image.putdata(([0,64,128,192,255,32]*((image.width*image.height+5)//6))[:image.width*image.height])
        data=io.BytesIO();image.save(data,format='PNG')
        params={'Texture/Pattern/Enabled':'true','Texture/Pattern/PatternFileName':'authored.png','Texture/Strength/UseCurve':'false',**(extra or {})}
        text=''.join('<param name="'+key+'"><![CDATA['+value+']]></param>' for key,value in params.items())
        path=Path(tmp)/'Texture.kpp';path.write_bytes(kpp(resources=text))
        c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'authored.png':data.getvalue()})
        self.assertEqual(c.skipped,[])
        brush=c.brushes[0];texture=brush['descriptor']['texture']
        asset=c.assets[texture['id']];raw=(c.output/asset['file']).read_bytes()
        return brush,texture,asset,raw

    def test_native_rectangle_top_left_padding_does_not_square_warp(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp)
            self.assertEqual(t['patternSize'],{'width':3,'height':2});self.assertEqual(t['periodPx'],3)
            self.assertEqual(t['application'],{'mode':'multiply','soft':False});self.assertEqual(a['size'],4)
            self.assertEqual(raw,bytes([0,64,128,0,192,255,32,0]+[0]*8))
            self.assertNotIn('grainDepth',b['descriptor']['behavior'].get('modulations',{}))

    def test_preprocess_and_fixed_random_offsets(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp,{'Texture/Pattern/Invert':'true','Texture/Pattern/TexturingMode':'1','Texture/Pattern/UseSoftTexturing':'true','Texture/Pattern/OffsetX':'-7','Texture/Pattern/OffsetY':'9','Texture/Pattern/isRandomOffsetX':'true'})
            self.assertEqual(raw[:4],bytes([255,191,127,0]))
            self.assertEqual(t['application'],{'mode':'subtract','soft':True})
            self.assertEqual(t['offset'],{'x':-7,'y':9,'randomX':True,'randomY':False})

    def test_rounded_scale_preserves_grid_ratio_and_reports_filter_approximation(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp,{'Texture/Pattern/Scale':'1.5'})
            self.assertEqual(t['patternSize'],{'width':5,'height':3});self.assertEqual(t['periodPx'],5)
            self.assertTrue(any(n['feature']=='textureResampling' for n in b['compatibility']))

    def test_strength_sensor_native_slash_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp,{'PressureTexture/Strength/':'true','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;0.5,0.2;1,1;</curve></params>'})
            controls=b['descriptor']['behavior']['modulations']['grainDepth']
            self.assertEqual(controls[0]['control'],'pressure');self.assertEqual(len(controls[0]['curve']['samples']),256)
            self.assertLess(controls[0]['curve']['samples'][128],.3)

    def test_unchecked_strength_ignores_stale_curve_and_constant(self):
        # Rock/Spread-Pattern/Water-Pattern keep an identity pressure curve in
        # XML while their native Strength checkbox is off. Hard subtract must
        # remain max(0,a-t), not max(0,a-t-(1-pressure)). Missing checkbox is off.
        for checked in (None,'false','true'):
            with self.subTest(checked=checked),tempfile.TemporaryDirectory() as tmp:
                extra={'Texture/Pattern/TexturingMode':'1','Texture/Strength/Value':'0.2',
                       'Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'}
                if checked is not None: extra['PressureTexture/Strength/']=checked
                b,t,a,raw=self.imported(tmp,extra)
                controls=b['descriptor']['behavior'].get('modulations',{}).get('grainDepth')
                self.assertEqual(t['strength'],.2 if checked=='true' else 1)
                self.assertEqual(bool(controls),checked=='true')

    def test_checked_constant_strength_does_not_require_curve(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp,{'PressureTexture/Strength/':'true','Texture/Strength/Value':'0.2','Texture/Strength/UseCurve':'false'})
            self.assertEqual(t['strength'],.2)
            self.assertNotIn('grainDepth',b['descriptor']['behavior'].get('modulations',{}))

    def test_unknown_application_keeps_explicit_legacy_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp,{'Texture/Pattern/TexturingMode':'12'})
            self.assertNotIn('application',t);self.assertNotIn('patternSize',t)
            self.assertTrue(any(n['feature']=='textureApplication' and n['status']=='unsupported' for n in b['compatibility']))

    def test_resolution_cap_keeps_world_period(self):
        with tempfile.TemporaryDirectory() as tmp:
            b,t,a,raw=self.imported(tmp,{'Texture/Pattern/Scale':'2'},size=(1500,2))
            self.assertEqual(t['periodPx'],3000);self.assertEqual(t['patternSize'],{'width':2048,'height':3})
            self.assertTrue(any(n['feature']=='textureResolution' and n['status']=='unsupported' for n in b['compatibility']))


if __name__=='__main__':unittest.main()
