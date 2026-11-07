"""Original self-authored native KPP controls; no vendor raster execution claim."""
import copy,unittest
import convert
import test_krita_foreground as fixtures
class SmudgeEraseTests(unittest.TestCase):
    def test_explicit_erase_aliases_keep_native_feedback_and_ui_erase_role(self):
        for modern in ['false','true']:
            for extra in [{'CompositeOp':'erase'},{'CompositeOp':'destination-out'},{'Krita/erase':'true'}]:
                c=fixtures.LegacyForegroundTests().brush({'SmudgeRateUseNewEngine':modern,'SmudgeRateValue':'.2',**extra})
                self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor']
                self.assertEqual(d['model'],'mixer');self.assertEqual(d['version'],88)
                self.assertIs(d['behavior']['erase'],True);self.assertEqual(d['behavior']['rendering']['blendMode'],'normal')
                self.assertEqual(d['mixer']['colorRateComposite'],'erase');self.assertEqual(d['mixer']['source'],'previousCanvas')
                self.assertEqual(d['mixer'].get('algorithm'),'krita-mask'if modern=='true'else None)
                self.assertAlmostEqual(d['mixer']['foreground']['rate'],.7 if modern=='true'else .56)
                convert.validate_portable_mixer(d)
                for mutate in [lambda x:x.update(version=87),lambda x:x['behavior'].update(erase=False)]:
                    bad=copy.deepcopy(d);mutate(bad)
                    with self.assertRaises(ValueError):convert.validate_portable_mixer(bad)
    def test_zero_color_rate_is_pure_blender_and_dulling_and_projection_survive_erase(self):
        for modern in ['false','true']:
            d=fixtures.LegacyForegroundTests().brush({'CompositeOp':'erase','PressureColorRate':'false','SmudgeRateUseNewEngine':modern,'MergedPaint':'true','SmudgeRateMode':'1'}).brushes[0]['descriptor']
            self.assertEqual(d['model'],'mixer');self.assertEqual(d['version'],88)
            self.assertEqual(d['mixer']['source'],'projectionCanvas');self.assertNotIn('foreground',d['mixer'])
            self.assertEqual(d['mixer']['sampling']['mode'],'maskMean'if modern=='true'else'adaptiveMean')
            convert.validate_portable_mixer(d)
    def test_rgb_gradient_and_material_native_sources_are_not_dropped_by_erase(self):
        for application in [1,2,3]:
            definition=f'<Brush type="png_brush" filename="tip.png" brushApplication="{application}"/>'
            c=fixtures.LegacyForegroundTests().brush({'CompositeOp':'erase'},definition)
            self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor']
            self.assertEqual(d['model'],'mixer');self.assertEqual(d['version'],88)
            self.assertEqual(d['mixer']['colorRateComposite'],'erase')
            if application==1:self.assertIn('planes',d['tip']['color']);self.assertEqual(d['mixer']['algorithm'],'krita-stamp')
            if application==2:self.assertIn('material',d['tip']);self.assertIn('paintThickness',d['mixer'])
            if application==3:self.assertIn('gradient',d['tip']['color'])
            convert.validate_portable_mixer(d)
    def test_eraser_mode_alone_is_not_misrepresented_as_native_erase_composite(self):
        d=fixtures.LegacyForegroundTests().brush({'EraserMode':'true'}).brushes[0]['descriptor']
        self.assertNotIn('colorRateComposite',d['mixer']);self.assertFalse(d['behavior'].get('erase',False))
if __name__=='__main__':unittest.main()
