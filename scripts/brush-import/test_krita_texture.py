"""Authored witnesses with explicit expected bytes, not a duplicate evaluator."""
import math
import unittest
from PIL import Image
from krita_texture import preprocess_texture


def gray(values):
    image=Image.new('L',(len(values),1));image.putdata(values);return image


class TextureTests(unittest.TestCase):
    def test_identity_qgray_and_white_alpha_composite(self):
        self.assertEqual(preprocess_texture(gray([0,64,128,255])).tobytes(),bytes([0,64,128,255]))
        image=Image.new('RGBA',(4,1));image.putdata([(255,0,0,255),(0,0,255,255),(0,0,0,128),(0,0,0,0)])
        self.assertEqual(preprocess_texture(image).tobytes(),bytes([87,39,127,255]))

    def test_brightness_subtracts_then_contrast_clamps_then_inverts(self):
        self.assertEqual(preprocess_texture(gray([0,128,255]),brightness=.25,contrast=2).tobytes(),bytes([0,1,255]))
        self.assertEqual(preprocess_texture(gray([0,128,255]),brightness=.25,contrast=2,invert=True).tobytes(),bytes([255,254,0]))
        self.assertEqual(preprocess_texture(gray([0,128,255]),contrast=0).tobytes(),bytes([128]*3))

    def test_neutral_piecewise_and_endpoint_no_division_by_zero(self):
        self.assertEqual(preprocess_texture(gray([0,51,102,153,255]),neutral_point=.2).tobytes(),bytes([0,128,159,191,255]))
        self.assertEqual(preprocess_texture(gray([0,255]),neutral_point=0).tobytes(),bytes([128,255]))
        self.assertEqual(preprocess_texture(gray([0,255]),neutral_point=1).tobytes(),bytes([0,128]))

    def test_cutoff_native_float_boundary_and_alpha_only_policy(self):
        source=gray([0,64,128,192,255])
        # Native float32(192/255) lies above double192/255: strict comparison
        # rejects this boundary even though its rounded byte is192.
        self.assertEqual(preprocess_texture(gray([192]),cutoff_policy=1,cutoff_right=192).tobytes(),b'\0')
        self.assertEqual(preprocess_texture(source,cutoff_policy=1,cutoff_left=64,cutoff_right=193).tobytes(),bytes([0,64,128,192,0]))
        self.assertEqual(preprocess_texture(source,cutoff_policy=2,cutoff_left=64,cutoff_right=193).tobytes(),bytes([255,64,128,192,255]))
        rgba=source.convert('RGBA')
        output=preprocess_texture(rgba,preserve_alpha=True,cutoff_policy=1,cutoff_left=64,cutoff_right=193)
        self.assertEqual(list(output.get_flattened_data()),[(0,0,0,0),(64,64,64,255),(128,128,128,255),(192,192,192,255),(255,255,255,0)])
        self.assertEqual(preprocess_texture(rgba,preserve_alpha=True,cutoff_policy=2,cutoff_left=255).getchannel('A').tobytes(),bytes([255]*5))

    def test_preserved_alpha_still_composites_white_and_palette_is_supported(self):
        source=Image.new('RGBA',(1,1),(0,0,0,128))
        self.assertEqual(preprocess_texture(source,preserve_alpha=True).tobytes(),bytes([127,127,127,128]))
        palette=Image.new('P',(1,1));palette.putpalette([0,0,0]*256);palette.info['transparency']=128
        self.assertEqual(preprocess_texture(palette,preserve_alpha=True).mode,'RGBA')
        self.assertEqual(preprocess_texture(gray([0]),preserve_alpha=True).mode,'L')

    def test_invalid_settings_and_budget_fail_without_mutating_input(self):
        source=gray([0,128,255]);before=source.tobytes()
        for options in [{'brightness':math.nan},{'contrast':math.inf},{'neutral_point':-1},{'cutoff_policy':3},{'cutoff_left':-1},{'max_pixels':2},{'invert':1}]:
            with self.subTest(options=options),self.assertRaises(ValueError):preprocess_texture(source,**options)
        preprocess_texture(source,invert=True)
        self.assertEqual(source.tobytes(),before)


if __name__=='__main__':unittest.main()
