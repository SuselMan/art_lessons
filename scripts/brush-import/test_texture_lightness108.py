"""Authored original KPP/PNG and independent exact gray/alpha witnesses."""
from pathlib import Path
import unittest,tempfile,io,base64,copy,json,hashlib
from PIL import Image
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle

def fixture(root,values=None,rgba=True,engine='paintbrush'):
    pattern=Image.new('RGBA'if rgba else'RGB',(2,2));pattern.putdata([(0,0,0,0),(0,0,0,128),(255,0,0,255),(0,0,255,255)]if rgba else[(0,0,0),(255,255,255),(255,0,0),(0,0,255)])
    def png(im):out=io.BytesIO();im.save(out,format='PNG');return out.getvalue()
    tip=Image.new('RGBA',(4,4),(0,0,0,128));params={'PaintOpAction':'1','SizeUseCurve':'false','Texture/Pattern/Enabled':'true','Texture/Pattern/PatternFileName':'authored-pattern.png','Texture/Pattern/TexturingMode':'2','PressureTexture/Strength/':'true','Texture/Strength/Value':'0','Texture/Strength/UseCurve':'false',**(values or{})}
    # kpp already owns SizeUseCurve. Override its source parameter once.
    params.pop('SizeUseCurve');text=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in params.items());raw=kpp('<Brush type="png_brush" filename="tip.png" brushApplication="0"/>',engine=engine,resources=text)
    c=Catalog(root/'native');result=preset(raw,'authored.kpp',c,{'authored-pattern.png':png(pattern),'tip.png':png(tip)});c.brushes.append(result);m=c.write();return c,m,raw

def portable(root,c,m):
    envelope={'library':m,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in m['assets']}};file=root/'roundtrip.grafetto-brushes.json';file.write_text(json.dumps(envelope));out=Catalog(root/'portable');portable_bundle(file,out);return envelope,out

class TextureLightness108Tests(unittest.TestCase):
    def test_native_rgba_preprocessing_keeps_gray_and_alpha_independent_even_strength0(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);c,m,raw=fixture(root);d=m['brushes'][0]['descriptor'];t=d['texture'];self.assertEqual(d['version'],108);self.assertEqual(t['material']['kind'],'lightness');self.assertEqual(t['strength'],0);self.assertNotIn('application',t)
            assets={a['id']:a for a in m['assets']};gray=(c.output/assets[t['id']]['file']).read_bytes();alpha=(c.output/assets[t['material']['alpha']]['file']).read_bytes();self.assertEqual(gray,bytes([255,127,87,39]));self.assertEqual(alpha,bytes([0,128,255,255]));self.assertEqual(gray[0],255);self.assertEqual(alpha[0],0)
            _,out=portable(root,c,m);self.assertEqual(out.brushes,m['brushes'])
    def test_rgb_pattern_is_opaque_gray_and_new_raw3_has_separate111_kind(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);c,m,_=fixture(root,rgba=False);t=m['brushes'][0]['descriptor']['texture'];assets={a['id']:a for a in m['assets']};self.assertEqual((c.output/assets[t['material']['alpha']]['file']).read_bytes(),bytes([255]*4))
        with tempfile.TemporaryDirectory()as tmp:
            _,m,_=fixture(Path(tmp),{'Texture/Pattern/TexturingMode':'3'});self.assertEqual(m['brushes'][0]['descriptor']['version'],111);self.assertEqual(m['brushes'][0]['descriptor']['texture']['material']['kind'],'gradient');self.assertTrue(any(n['feature']=='textureGradient'and n['status']=='supported'for n in m['brushes'][0]['compatibility']))
    def test_strength_constant_once_and_inactive_curve_does_not_parse_stale_sensor(self):
        for strength in['0','.25','.75','1']:
            with tempfile.TemporaryDirectory()as tmp:
                _,m,_=fixture(Path(tmp),{'Texture/Strength/Value':strength,'Texture/Strength/Sensor':'malformed UNUSED XML'});self.assertEqual(m['brushes'][0]['descriptor']['texture']['strength'],float(strength))
        sensors='<params id="sensorslist"><ChildSensor id="pressure"><curve>0,0;1,1;</curve></ChildSensor><ChildSensor id="declination"><curve>0,0;1,1;</curve></ChildSensor></params>'
        with tempfile.TemporaryDirectory()as tmp:
            _,m,_=fixture(Path(tmp),{'Texture/Strength/Value':'.25','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':sensors,'Texture/Strength/curveMode':'1'});d=m['brushes'][0]['descriptor'];self.assertEqual(d['texture']['strength'],1);self.assertEqual(d['behavior']['modulations']['grainDepth'][0]['combine']['constant'],.25)
    def test_portable_marker_revision_alpha_shape_child_and_rgba_exclusions_before_outputs(self):
        for case in['version','alphaMissing','alphaDimensions','gradient','application','child','image','erase','extra']:
            with tempfile.TemporaryDirectory()as tmp:
                root=Path(tmp);c,m,_=fixture(root);env,_=portable(root,c,m);bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];t=d['texture']
                if case=='version':d['version']=107
                elif case=='alphaMissing':t['material']['alpha']='asset:'+'f'*64
                elif case=='alphaDimensions':t['patternSize']['width']=3
                elif case=='gradient':t['material']['kind']='gradient'
                elif case=='application':t['application']={'mode':'multiply','soft':False}
                elif case=='child':child=copy.deepcopy(d);d.pop('texture');d['behavior']['dual']={'brush':child,'blendMode':'normal'}
                elif case=='image':d['tip']['color']={'planes':[d['tip']['mask']]*3}
                elif case=='erase':d['behavior']['erase']=True
                else:t['material']['soft']=True
                file=root/'bad.grafetto-brushes.json';file.write_text(json.dumps(bad));out=Catalog(root/'reject')
                with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(file,out)
                self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])

    def test_private_nonpixel_bridges_never_admit_lightness108(self):
        # Real adapters rewrite the private PNG to paintbrush; their original
        # family must still retain the existing explicit unsupported fallback.
        for engine in ['hatchingbrush','sketchbrush','hairybrush','curvebrush']:
            with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
                _,m,_=fixture(Path(tmp),engine=engine)
                self.assertNotIn('material',m['brushes'][0]['descriptor'].get('texture',{}))
                self.assertFalse(any(n['feature']=='textureLightness'and n['status']=='supported'for n in m['brushes'][0]['compatibility']))
                self.assertTrue(any(n['feature']=='textureApplication'and n['status']=='unsupported'for n in m['brushes'][0]['compatibility']))

    def test_original_channel_presence_controls_cutoff_not_opaque_rgba_conversion(self):
        from krita_texture import preprocess_texture
        for policy,expected_gray in [(1,0),(2,255)]:
            for mode in ['RGB','L']:
                im=Image.new(mode,(1,1),(64,64,64)if mode=='RGB'else 64)
                out=preprocess_texture(im,preserve_alpha=True,cutoff_policy=policy,cutoff_left=100,cutoff_right=200)
                self.assertEqual(out.mode,'L');self.assertEqual(out.tobytes(),bytes([expected_gray]))
            out=preprocess_texture(Image.new('RGBA',(1,1),(64,64,64,255)),preserve_alpha=True,cutoff_policy=policy,cutoff_left=100,cutoff_right=200)
            self.assertEqual(out.tobytes(),bytes([64,64,64,0 if policy==1 else 255]))
