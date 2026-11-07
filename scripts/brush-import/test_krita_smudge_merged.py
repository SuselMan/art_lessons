"""Native-format authored sources; legacy projected foreground strategy85."""
import copy,unittest
import convert
import test_krita_foreground as fixtures
class MergedLegacyTests(unittest.TestCase):
    def test_merged_two_modes_are85_and_prior_layer_stays83(self):
        for mode in ['multiply','screen']:
            for merged,version,source in [('true',85,'projectionCanvas'),('false',83,'previousCanvas')]:
                c=fixtures.LegacyForegroundTests().brush({'CompositeOp':mode,'MergedPaint':merged,'SmudgeRateValue':'.2'})
                self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor']
                self.assertEqual(d['version'],version);self.assertEqual(d['mixer']['source'],source)
                self.assertEqual(d['mixer']['colorRateComposite'],mode);self.assertNotIn('algorithm',d['mixer'])
                self.assertAlmostEqual(d['mixer']['foreground']['rate'],.56)
                self.assertEqual(d['behavior']['rendering']['blendMode'],'normal')
                convert.validate_portable_mixer(d)
                if merged=='true':
                    for old in [83,84]:
                        bad=copy.deepcopy(d);bad['version']=old
                        with self.assertRaises(ValueError):convert.validate_portable_mixer(bad)
    def test_normal_merged_and_modern_modes_do_not_change_versions(self):
        for modern,version in [('false',38),('true',38)]:
            d=fixtures.LegacyForegroundTests().brush({'MergedPaint':'true','SmudgeRateUseNewEngine':modern}).brushes[0]['descriptor']
            self.assertEqual(d['version'],version);self.assertNotIn('colorRateComposite',d['mixer'])
if __name__=='__main__':unittest.main()
