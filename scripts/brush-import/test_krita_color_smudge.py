"""Authored new-engine settings, no vendor execution or native artwork."""
import unittest,copy,json,base64,hashlib,tempfile
from pathlib import Path
import convert
from test_krita_foreground import LegacyForegroundTests
class ColorSmudgeImportTests(LegacyForegroundTests):
    def test_new_smearing_rates_not_legacy_prefactor(self):
        d=self.brush({'SmudgeRateUseNewEngine':'true','SmudgeRateValue':'.9'}).brushes[0]['descriptor']
        self.assertEqual(d['mixer']['algorithm'],'krita-mask')
        self.assertEqual(d['mixer']['foreground']['rate'],.7)
        self.assertNotIn('sampling',d['mixer'])
        self.assertEqual(d['flow'],1)
    def test_new_dulling_uses_mask_weighted_sampling(self):
        d=self.brush({'SmudgeRateUseNewEngine':'true','SmudgeRateMode':'1','PressureSmudgeRadius':'true','SmudgeRadiusUseCurve':'false','SmudgeRadiusVersion':'2','SmudgeRadiusValue':'3'}).brushes[0]['descriptor']
        self.assertEqual(d['mixer']['sampling'],{'mode':'maskMean','radius':1})
    def test_disabled_color_rate_stays_a_pure_blender(self):
        d=self.brush({'SmudgeRateUseNewEngine':'true','PressureColorRate':'false'}).brushes[0]['descriptor']
        self.assertNotIn('foreground',d['mixer'])
    def test_image_stamp_keeps_real_rgb_planes(self):
        c=self.brush({},'<Brush type="png_brush" filename="tip.png" brushApplication="1"/>')
        self.assertEqual(c.skipped,[])
        d=c.brushes[0]['descriptor']
        self.assertEqual(d['mixer']['algorithm'],'krita-stamp')
        self.assertEqual(len(d['tip']['color']['planes']),3)
        self.assertNotIn('imageSampling',d['tip'])
        self.assertEqual(d['mixer']['foreground']['rate'],.7)
    def test_portable_rgb_roundtrip_checks_every_plane_before_writing(self):
        b=self.brush({'SmudgeRateUseNewEngine':'true'}).brushes[0]
        d=copy.deepcopy(b['descriptor']);d['mixer']['algorithm']='krita-stamp'
        raws=[bytes([v]*4) for v in (255,200,100,50)]
        ids=['asset:'+hashlib.sha256(raw).hexdigest() for raw in raws]
        d['tip']={'kind':'bitmap','mask':ids[0],'hardness':1,'aspect':1,'angle':0,'rotation':'fixed','color':{'planes':ids[1:]}}
        bundle={'library':{'schemaVersion':1,'brushes':[{**b,'descriptor':d}],'assets':[{'id':aid,'size':2,'file':aid[6:]+'.bin'} for aid in ids],'skipped':[]},'assets':{aid:base64.b64encode(raw).decode() for aid,raw in zip(ids,raws)}}
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'tip.grafetto-brushes.json';p.write_text(json.dumps(bundle))
            c=convert.Catalog(Path(tmp)/'valid');convert.portable_bundle(p,c)
            self.assertEqual(c.brushes[0]['descriptor']['tip']['color']['planes'],ids[1:])
            bad=copy.deepcopy(bundle);bad['library']['brushes'][0]['descriptor']['tip']['color']['planes'][0]='asset:'+'f'*64
            p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/'bad')
            with self.assertRaises(ValueError):convert.portable_bundle(p,out)
            self.assertEqual(list(out.output.iterdir()),[])
    def test_lightness_creates_persistent_height_and_dynamic_thickness(self):
        c=self.brush({'PressurePaintThickness':'true','PaintThicknessValue':'.4','PaintThicknessThicknessMode':'1','PaintThicknessUseCurve':'true','PaintThicknessSensor':'<params id="pressure"/>'},'<Brush type="png_brush" filename="tip.png" brushApplication="2"/>')
        self.assertEqual(c.skipped,[])
        d=c.brushes[0]['descriptor']
        self.assertEqual(d['version'],37)
        self.assertEqual(d['tip']['material']['kind'],'lightness')
        self.assertEqual(d['mixer']['algorithm'],'krita-mask')
        self.assertEqual(d['mixer']['paintThickness']['value'],.4)
        self.assertEqual(d['mixer']['paintThickness']['mode'],'overwrite')
        self.assertEqual(d['mixer']['paintThickness']['dynamics'][0]['control'],'pressure')
        self.assertFalse(any(n['status']=='unsupported' and 'PaintThickness' in n['feature'] for n in c.brushes[0]['compatibility']))
    def test_lightness_overlay_without_checkbox_uses_full_thickness(self):
        d=self.brush({'PaintThicknessValue':'.2'},'<Brush type="png_brush" filename="tip.png" brushApplication="2"/>').brushes[0]['descriptor']
        self.assertEqual(d['mixer']['paintThickness'],{'value':1,'mode':'overwrite'})
    def test_lightness_ignores_merged_paint_as_native_strategy_does(self):
        b=self.brush({'MergedPaint':'true'},'<Brush type="png_brush" filename="tip.png" brushApplication="2"/>').brushes[0]
        self.assertEqual(b['descriptor']['mixer']['source'],'previousCanvas')
        self.assertIn('paintThickness',b['descriptor']['mixer'])
        self.assertTrue(any(n['feature']=='materialMergedPaint' and n['status']=='supported' for n in b['compatibility']))
    def test_merged_paint_keeps_legacy_and_modern_rate_models(self):
        for modern in ['false','true']:
            d=self.brush({'MergedPaint':'true','SmudgeRateUseNewEngine':modern}).brushes[0]['descriptor']
            self.assertEqual(d['mixer']['source'],'projectionCanvas')
            self.assertEqual(d['version'],38)
            self.assertEqual(d['mixer'].get('algorithm'),'krita-mask' if modern=='true' else None)
            self.assertAlmostEqual(d['mixer']['foreground']['rate'],.7 if modern=='true' else .14)
    def test_legacy_contract_unchanged(self):
        m=self.brush({'SmudgeRateValue':'1'}).brushes[0]['descriptor']['mixer']
        self.assertNotIn('algorithm',m)
        self.assertAlmostEqual(m['foreground']['rate'],.14)
if __name__=='__main__':unittest.main()
