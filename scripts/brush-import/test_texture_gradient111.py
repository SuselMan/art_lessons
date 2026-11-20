"""Original KPP raw3 import/portable contract; captured palette is operational."""
from pathlib import Path
import unittest,tempfile,copy,json
from test_texture_lightness108 import fixture,portable
from brush_contract import Catalog
from convert import portable_bundle

class TextureGradient111Tests(unittest.TestCase):
    def test_original_raw3_compiles_same_gray_alpha_as108_and_marks_new_law(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);c,m,_=fixture(root,{'Texture/Pattern/TexturingMode':'3'});d=m['brushes'][0]['descriptor'];self.assertEqual(d['version'],111);self.assertEqual(d['texture']['material']['kind'],'gradient');self.assertEqual(d['texture']['strength'],0)
            assets={a['id']:a for a in m['assets']};self.assertEqual((c.output/assets[d['texture']['id']]['file']).read_bytes(),bytes([255,127,87,39]));self.assertEqual((c.output/assets[d['texture']['material']['alpha']]['file']).read_bytes(),bytes([0,128,255,255]));self.assertTrue(any(n['feature']=='textureGradient'and n['status']=='supported'for n in m['brushes'][0]['compatibility']));self.assertFalse(any(n['feature']=='textureLightness'for n in m['brushes'][0]['compatibility']));_,out=portable(root,c,m);self.assertEqual(out.brushes,m['brushes'])
    def test_new_raw3_strength_compound_constant_and_color_smudge109_fallback(self):
        sensors='<params id="sensorslist"><ChildSensor id="pressure"><curve>0,0;1,1;</curve></ChildSensor><ChildSensor id="declination"><curve>0,0;1,1;</curve></ChildSensor></params>'
        with tempfile.TemporaryDirectory()as tmp:
            _,m,_=fixture(Path(tmp),{'Texture/Pattern/TexturingMode':'3','Texture/Strength/Value':'.25','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':sensors,'Texture/Strength/curveMode':'1'});d=m['brushes'][0]['descriptor'];self.assertEqual(d['texture']['strength'],1);self.assertEqual(d['behavior']['modulations']['grainDepth'][0]['combine']['constant'],.25)
        with tempfile.TemporaryDirectory()as tmp:
            _,m,_=fixture(Path(tmp),{'Texture/Pattern/TexturingMode':'3','SmudgeRateUseNewEngine':'true','SmudgeRateMode':'0'},engine='colorsmudge');d=m['brushes'][0]['descriptor'];self.assertNotIn('material',d['texture']);self.assertEqual(d['texture']['application']['mode'],'subtract');self.assertTrue(any(n['feature']=='nativeTextureModeFallback'for n in m['brushes'][0]['compatibility']))
    def test_real_foreign_private_bridges_do_not_gain111(self):
        for engine in ['hatchingbrush','sketchbrush','hairybrush','curvebrush']:
            with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
                _,m,_=fixture(Path(tmp),{'Texture/Pattern/TexturingMode':'3'},engine=engine);self.assertNotIn('material',m['brushes'][0]['descriptor'].get('texture',{}));self.assertFalse(any(n['feature']=='textureGradient'and n['status']=='supported'for n in m['brushes'][0]['compatibility']))
    def test_portable111_exact_root_scope_revision_planes_and_padding_before_outputs(self):
        for case in ['rev110','kind','alpha','dimensions','padding','application','tipcolor','dual','child','erase','extra']:
            with self.subTest(case=case),tempfile.TemporaryDirectory()as tmp:
                root=Path(tmp);c,m,_=fixture(root,{'Texture/Pattern/TexturingMode':'3'});env,_=portable(root,c,m);bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];t=d['texture']
                if case=='rev110':d['version']=110
                elif case=='kind':t['material']['kind']='unknown'
                elif case=='alpha':t['material']['alpha']='asset:'+'f'*64
                elif case=='dimensions':t['patternSize']['width']=3
                elif case=='padding':t['patternSize']['width']=1
                elif case=='application':t['application']={'mode':'multiply','soft':False}
                elif case=='tipcolor':d['tip']['color']={'planes':[d['tip']['mask']]*3}
                elif case=='dual':d['behavior']['dual']={'brush':copy.deepcopy(d),'blendMode':'normal'}
                elif case=='child':
                    child=copy.deepcopy(d);d.pop('texture');d['behavior']['dual']={'brush':child,'blendMode':'normal','sampling':'independent'}
                elif case=='erase':d['behavior']['erase']=True
                else:t['material']['extra']=1
                file=root/'bad.grafetto-brushes.json';file.write_text(json.dumps(bad));out=Catalog(root/'bad-output')
                with self.assertRaises(ValueError):portable_bundle(file,out)
                self.assertEqual(out.brushes,[]);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
