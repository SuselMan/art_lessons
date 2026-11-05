"""Authored lightness transfer witnesses; no commercial source pixels."""
import math
import unittest
from PIL import Image
from krita_lightness import adjustment_settings,compile_lightness_planes


def gray(values,alpha=255):
    image=Image.new('RGBA',(len(values),1));image.putdata([(v,v,v,alpha) for v in values]);return image


class LightnessTests(unittest.TestCase):
    def test_neutral_qgray_preserves_alpha_separate_from_gray(self):
        source=Image.new('RGBA',(4,1));source.putdata([(255,0,0,255),(0,0,255,128),(128,128,128,0),(255,255,255,1)])
        g,a=compile_lightness_planes(source)
        self.assertEqual(g.tobytes(),bytes([87,39,128,255]))
        self.assertEqual(a.tobytes(),bytes([255,128,0,1]))

    def test_midpoint_and_half127_with_brightness_endpoints(self):
        source=gray([0,64,127,192,255])
        g,_=compile_lightness_planes(source,adjustment_version=2,midpoint=64)
        self.assertEqual(g.tobytes(),bytes([0,127,169,213,255]))
        g,_=compile_lightness_planes(source,adjustment_version=2,brightness=1)
        self.assertEqual(g.tobytes(),bytes([0,129,255,255,255]))
        g,_=compile_lightness_planes(source,adjustment_version=2,brightness=-1)
        self.assertEqual(g.tobytes(),bytes([0,0,0,129,255]))

    def test_contrast_positive_negative_and_defined_step(self):
        source=gray([0,64,127,192,255])
        self.assertEqual(compile_lightness_planes(source,adjustment_version=2,contrast=.5)[0].tobytes(),bytes([0,1,127,255,255]))
        self.assertEqual(compile_lightness_planes(source,adjustment_version=2,contrast=-.5)[0].tobytes(),bytes([64,96,127,160,191]))
        self.assertEqual(compile_lightness_planes(source,adjustment_version=2,contrast=1)[0].tobytes(),bytes([0,0,255,255,255]))

    def test_legacy_animated100_101_parameters_and_explicit_false_gate(self):
        raw=dict(midpoint=109,brightness=.05,contrast=-.29)
        migrated=adjustment_settings(**raw)
        self.assertEqual(migrated['midpoint'],91)
        self.assertAlmostEqual(migrated['brightness'],.1)
        self.assertAlmostEqual(migrated['contrast'],-.36708860759493667)
        source=gray([0,91,109,127,255],128)
        g,a=compile_lightness_planes(source,**raw)
        self.assertEqual(g.tobytes(),bytes([51,140,148,156,213]))
        self.assertEqual(a.tobytes(),bytes([128]*5))
        modern=adjustment_settings(**raw,auto_midpoint=False)
        self.assertEqual(modern['midpoint'],109);self.assertEqual(modern['brightness'],.05);self.assertEqual(modern['contrast'],-.29)
        self.assertEqual(adjustment_settings(**raw,adjustment_version=2),modern)

    def test_auto_midpoint_alpha_weighting_rounds_before_sum(self):
        source=Image.new('RGBA',(3,1));source.putdata([(64,64,64,255),(192,192,192,255),(255,255,255,0)])
        g,a=compile_lightness_planes(source,auto_midpoint=True)
        self.assertEqual(g.tobytes(),bytes([64,192,255]))
        self.assertEqual(a.tobytes(),bytes([255,255,0]))
        # A sole128gray with alpha1 rounds its weighted gray to1, giving native
        # average255; report the resulting singular transfer explicitly.
        with self.assertRaises(ValueError):compile_lightness_planes(gray([128],1),auto_midpoint=True)

    def test_invalid_and_singular_settings_budget_and_input_immutability(self):
        source=gray([0,127,255]);before=source.tobytes()
        for options in [{'brightness':math.nan},{'contrast':2},{'midpoint':-1},{'midpoint':255},{'auto_midpoint':'false'},{'adjustment_version':3},{'max_pixels':2},{'brightness':.75}]:
            with self.subTest(options=options),self.assertRaises(ValueError):compile_lightness_planes(source,**options)
        compile_lightness_planes(source,adjustment_version=2,contrast=.5)
        self.assertEqual(source.tobytes(),before)


if __name__=='__main__':unittest.main()
