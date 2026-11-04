import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
CASES={'tint': 'tint', 'inc_saturation': 'increaseSaturation', 'dec_saturation': 'decreaseSaturation', 'inc_luminosity': 'increaseLuminosity', 'dec_luminosity': 'decreaseLuminosity', 'color_hsl': 'colorHsl', 'hue_hsl': 'hueHsl', 'saturation_hsl': 'saturationHsl', 'inc_saturation_hsl': 'increaseSaturationHsl', 'dec_saturation_hsl': 'decreaseSaturationHsl', 'lightness': 'lightnessHsl', 'inc_lightness': 'increaseLightnessHsl', 'dec_lightness': 'decreaseLightnessHsl', 'color_hsv': 'colorHsv', 'hue_hsv': 'hueHsv', 'saturation_hsv': 'saturationHsv', 'inc_saturation_hsv': 'increaseSaturationHsv', 'dec_saturation_hsv': 'decreaseSaturationHsv', 'value': 'valueHsv', 'inc_value': 'increaseValueHsv', 'dec_value': 'decreaseValueHsv', 'color_hsi': 'colorHsi', 'hue_hsi': 'hueHsi', 'saturation_hsi': 'saturationHsi', 'inc_saturation_hsi': 'increaseSaturationHsi', 'dec_saturation_hsi': 'decreaseSaturationHsi', 'intensity': 'intensityHsi', 'inc_intensity': 'increaseIntensityHsi', 'dec_intensity': 'decreaseIntensityHsi'}
class PixelHsxCompositeTests(unittest.TestCase):
    def test_original_hsx_raws_capture_vector_mode_and_revision42(self):
        for raw,mode in CASES.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);d=catalog.brushes[0]['descriptor']
                self.assertEqual(d['version'],42);self.assertEqual(d['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(d['sourceStamp']['settings']['CompositeOp'],raw);self.assertEqual(path.read_bytes(),source)
    def test_unaffected_revisions_stay_and_affected_mask_propagates42(self):
        for raw,version in [('normal',27),('grain_merge',38),('glow_heat',39),('penumbra b',40),('xor',41)]:
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.brushes[0]['descriptor']['version'],version)
        with tempfile.TemporaryDirectory() as tmp:
            fields='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">inc_saturation</param>'
            path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(resources=fields))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog);d=catalog.brushes[0]['descriptor']
            self.assertEqual(d['version'],42);self.assertEqual(d['behavior']['dual']['brush']['version'],42)
            self.assertEqual(d['behavior']['dual']['brush']['behavior']['rendering']['blendMode'],'increaseSaturation')
