"""Authored native-format sources; no vendor execution/pixel identity claim."""
import copy
import unittest
import convert
import test_krita_foreground as source_fixture

class SmudgeStrategiesTests(unittest.TestCase):
    def brush(self,params,definition=None):
        return source_fixture.LegacyForegroundTests().brush(params,definition)
    def test_modern_three_foreground_modes_real_mask_and_rgb_source(self):
        for raw,mode in [('grain_merge','grainMerge'),('grain_extract','grainExtract'),('negation','negation')]:
            for definition in [None,'<Brush type="png_brush" filename="tip.png" brushApplication="1"/>']:
                c=self.brush({'SmudgeRateUseNewEngine':'true','CompositeOp':raw},definition)
                self.assertEqual(c.skipped,[])
                b=c.brushes[0];d=b['descriptor']
                self.assertEqual(d['version'],82)
                self.assertEqual(d['mixer']['colorRateComposite'],mode)
                self.assertEqual(d['mixer']['source'],'previousCanvas')
                self.assertEqual(d['mixer']['algorithm'],'krita-stamp'if definition else'krita-mask')
                self.assertAlmostEqual(d['mixer']['foreground']['rate'],.7)
                self.assertEqual(d['behavior']['rendering']['blendMode'],'normal')
                self.assertFalse(any(n['status']=='unsupported'and n['feature']in('blendMode','colorSmudge')for n in b['compatibility']))
                convert.validate_portable_mixer(d)
                bad=copy.deepcopy(d);bad['version']=81
                with self.assertRaises(ValueError):convert.validate_portable_mixer(bad)
    def test_legacy_two_modes_compensate_exactly_once_and_keep_projection_closed(self):
        for mode in ['multiply','screen']:
            d=self.brush({'CompositeOp':mode,'SmudgeRateValue':'.2'}) .brushes[0]['descriptor']
            self.assertEqual(d['version'],83);self.assertEqual(d['mixer']['colorRateComposite'],mode)
            self.assertNotIn('algorithm',d['mixer']);self.assertEqual(d['mixer']['source'],'previousCanvas')
            self.assertAlmostEqual(d['mixer']['foreground']['rate'],.56)
            self.assertEqual(d['behavior']['rendering']['blendMode'],'normal')
            convert.validate_portable_mixer(d)
            for change in [('version',82),('source','projectionCanvas'),('algorithm','krita-mask')]:
                bad=copy.deepcopy(d)
                if change[0]=='version':bad['version']=change[1]
                else:bad['mixer'][change[0]]=change[1]
                with self.assertRaises(ValueError):convert.validate_portable_mixer(bad)
            b=self.brush({'CompositeOp':mode,'MergedPaint':'true'}).brushes[0]
            self.assertNotIn('colorRateComposite',b['descriptor']['mixer'])
            self.assertTrue(any(n['feature']=='colorSmudge'and n['status']=='unsupported'for n in b['compatibility']))
    def test_old_normal_and_modern_multiply_paths_remain_unchanged(self):
        for params in [{},{'SmudgeRateUseNewEngine':'true','CompositeOp':'multiply'}]:
            d=self.brush(params).brushes[0]['descriptor']
            self.assertNotIn('colorRateComposite',d['mixer'])
            self.assertLess(d['version'],82)
        d=self.brush({'SmudgeRateUseNewEngine':'true','CompositeOp':'hard_mix_photoshop'}).brushes[0]['descriptor']
        self.assertEqual(d['version'],65);self.assertEqual(d['mixer']['colorRateComposite'],'hardMixPhotoshop')

if __name__=='__main__':unittest.main()
