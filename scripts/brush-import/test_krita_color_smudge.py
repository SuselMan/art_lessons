"""Authored new-engine settings, no vendor execution or native artwork."""
import unittest
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
    def test_legacy_contract_unchanged(self):
        m=self.brush({'SmudgeRateValue':'1'}).brushes[0]['descriptor']['mixer']
        self.assertNotIn('algorithm',m)
        self.assertAlmostEqual(m['foreground']['rate'],.14)
if __name__=='__main__':unittest.main()
