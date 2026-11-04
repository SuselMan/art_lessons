import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
CASES={'gamma_dark': 'gammaDark', 'gamma_light': 'gammaLight', 'gamma_illumination': 'gammaIllumination', 'easy dodge': 'easyDodge', 'easy burn': 'easyBurn', 'pnorm_a': 'pNormA', 'pnorm_b': 'pNormB', 'super_light': 'superLight', 'soft_light_ifs_illusions': 'softLightIfs', 'soft_light_pegtop_delphi': 'softLightPegtop', 'tint_ifs_illusions': 'tintIfs', 'shade_ifs_illusions': 'shadeIfs', 'fog_lighten_ifs_illusions': 'fogLightenIfs', 'fog_darken_ifs_illusions': 'fogDarkenIfs', 'modulo': 'modulo', 'modulo_continuous': 'moduloContinuous', 'divisive_modulo': 'divisiveModulo', 'divisive_modulo_continuous': 'divisiveModuloContinuous', 'modulo_shift': 'moduloShift', 'modulo_shift_continuous': 'moduloShiftContinuous', 'hard overlay': 'hardOverlay', 'interpolation': 'interpolation', 'interpolation 2x': 'interpolation2x'}
MODULO={'divisive_modulo_continuous', 'modulo_shift_continuous', 'divisive_modulo', 'modulo_continuous', 'modulo', 'modulo_shift'}
class PixelScalarCompositeTests(unittest.TestCase):
    def test_all23_original_raw_modes_capture43_and_modulo_is_honest_functional(self):
        for raw,mode in CASES.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);row=catalog.brushes[0];d=row['descriptor']
                self.assertEqual(d['version'],43);self.assertEqual(d['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(d['sourceStamp']['settings']['CompositeOp'],raw);self.assertEqual(path.read_bytes(),source)
                notes=[n for n in row.get('compatibility',[])if n['feature']=='moduloCompositeFunctional']
                if raw in MODULO:
                    self.assertEqual(len(notes),1);self.assertEqual(notes[0]['status'],'approximate');self.assertIn('defined-rational-u8-modulo-v1',notes[0]['detail'])
                else:self.assertEqual(notes,[])
    def test_old_revisions_unchanged_and_new_child_propagates43(self):
        for raw,version in [('normal',27),('grain_merge',38),('glow_heat',39),('penumbra b',40),('xor',41),('color_hsv',42)]:
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog);self.assertEqual(catalog.brushes[0]['descriptor']['version'],version)
        with tempfile.TemporaryDirectory() as tmp:
            fields='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">modulo_shift</param>'
            path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(resources=fields));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog);d=catalog.brushes[0]['descriptor'];self.assertEqual(d['version'],43);self.assertEqual(d['behavior']['dual']['brush']['version'],43)
