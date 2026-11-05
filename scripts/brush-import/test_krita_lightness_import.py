"""Authored paired-plane static/animated import, no source resource artwork."""
import io
import json
import base64
import struct
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp


def png(image):
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()


def gbr(gray,alpha):
    return struct.pack('>7I',29,2,1,1,4,0x47494d50,25)+b'\0'+bytes([gray,gray,gray,alpha])


class LightnessImportTests(unittest.TestCase):
    def test_static_gray_and_alpha_have_same_bounds_and_independent_cas(self):
        with tempfile.TemporaryDirectory() as tmp:
            definition='<Brush type="png_brush" filename="tip.png" preserveLightness="1" AdjustmentVersion="2"/>'
            image=Image.new('RGBA',(3,2),(128,128,128,64))
            path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.png':png(image)})
            self.assertEqual(c.skipped,[]);tip=c.brushes[0]['descriptor']['tip'];material=tip['material']
            self.assertEqual(material['strength'],1);self.assertNotEqual(tip['mask'],material['gray'])
            a=c.assets[tip['mask']];g=c.assets[material['gray']]
            self.assertEqual(a['size'],g['size']);self.assertEqual(a['size'],4)
            self.assertEqual((c.output/a['file']).read_bytes(),bytes([0]*4+[64,64,64,0,64,64,64,0]+[0]*4))
            self.assertEqual((c.output/g['file']).read_bytes(),bytes([0]*4+[128,128,128,0,128,128,128,0]+[0]*4))

    def test_gih_repeated_alpha_and_distinct_grays_preserve_parallel_frame_indices(self):
        with tempfile.TemporaryDirectory() as tmp:
            definition='<Brush type="gbr_brush" filename="tip.gih" preserveLightness="1" AdjustmentMidPoint="109" BrightnessAdjustment=".05" ContrastAdjustment="-.29"/>'
            pipe=b'Authored\n2 dim:1 rank0:2 sel0:incremental\n'+gbr(91,128)+gbr(255,128)
            path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.gih':pipe})
            self.assertEqual(c.skipped,[]);tip=c.brushes[0]['descriptor']['tip']
            self.assertEqual(tip['animation']['frames'][0],tip['animation']['frames'][1])
            gray=tip['material']['grayFrames'];self.assertNotEqual(gray[0],gray[1]);self.assertEqual(gray[0],tip['material']['gray'])
            self.assertEqual((c.output/c.assets[gray[0]]['file']).read_bytes(),bytes([140,0,0,0]))
            self.assertEqual((c.output/c.assets[gray[1]]['file']).read_bytes(),bytes([213,0,0,0]))
            self.assertFalse(any(x['feature']=='gihColour' for x in c.brushes[0]['compatibility']))

    def test_portable_material_missing_gray_is_rejected_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            definition='<Brush type="png_brush" filename="tip.png" preserveLightness="1" AdjustmentVersion="2"/>'
            path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition))
            c=convert.Catalog(Path(tmp)/'original');convert_krita(path,c,{'tip.png':png(Image.new('RGBA',(2,2),(128,128,128,64)))})
            library=c.write();bundle={'library':library,'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode() for aid,a in c.assets.items()}}
            portable=Path(tmp)/'test.grafetto-brushes.json';portable.write_text(json.dumps(bundle))
            valid=convert.Catalog(Path(tmp)/'valid');convert.portable_bundle(portable,valid)
            self.assertEqual(valid.brushes[0]['descriptor']['tip']['material'],c.brushes[0]['descriptor']['tip']['material'])
            library['brushes'][0]['descriptor']['tip']['material']['gray']='asset:'+'f'*64
            portable.write_text(json.dumps(bundle));invalid=convert.Catalog(Path(tmp)/'invalid')
            with self.assertRaisesRegex(ValueError,'lightness'):convert.portable_bundle(portable,invalid)
            self.assertEqual(list(invalid.output.iterdir()),[])

    def test_disabled_strength_curve_keeps_constant_without_false_unsupported(self):
        with tempfile.TemporaryDirectory() as tmp:
            definition='<Brush type="png_brush" filename="tip.png" preserveLightness="1" AdjustmentVersion="2"/>'
            saved='<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthUseCurve">false</param><param name="LightnessStrengthValue">.25</param>'
            path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition,resources=saved))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.png':png(Image.new('RGBA',(2,2),(128,128,128,64)))})
            self.assertEqual(c.skipped,[]);brush=c.brushes[0]
            self.assertEqual(brush['descriptor']['tip']['material']['strength'],.25)
            self.assertFalse(any(x['status']=='unsupported' and ('lightnessStrength'==x['feature'] or 'PressureLightnessStrength' in x['detail']) for x in brush['compatibility']))

    def test_mixer_lightness_keeps_material_and_strength_sensor_is_honest(self):
        for engine in ['colorsmudge','paintbrush']:
            with self.subTest(engine=engine),tempfile.TemporaryDirectory() as tmp:
                definition='<Brush type="png_brush" filename="tip.png" preserveLightness="1" AdjustmentVersion="2"/>'
                path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition,engine=engine,resources='<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthValue">.5</param>'))
                c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.png':png(Image.new('RGBA',(2,2),(128,128,128,64)))})
                self.assertEqual(c.skipped,[]);brush=c.brushes[0]
                if engine=='colorsmudge':
                    self.assertEqual(brush['descriptor']['tip']['material']['kind'],'lightness')
                    self.assertEqual(brush['descriptor']['mixer']['paintThickness'],{'value':1,'mode':'overlay'})
                else:
                    self.assertEqual(brush['descriptor']['tip']['material']['strength'],.5)
                    self.assertTrue(any(x['feature']=='lightnessStrength' and x['status']=='unsupported' for x in brush['compatibility']))


if __name__=='__main__':unittest.main()
