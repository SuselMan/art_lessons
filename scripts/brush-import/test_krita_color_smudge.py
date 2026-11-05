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
    def test_legacy_contract_unchanged(self):
        m=self.brush({'SmudgeRateValue':'1'}).brushes[0]['descriptor']['mixer']
        self.assertNotIn('algorithm',m)
        self.assertAlmostEqual(m['foreground']['rate'],.14)
if __name__=='__main__':unittest.main()
