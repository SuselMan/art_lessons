import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
CASES={'copy_red': 'copyRed', 'copy_green': 'copyGreen', 'copy_blue': 'copyBlue', 'behind': 'behind', 'luminosity_sai': 'luminositySai', 'greater': 'greater'}
MODULO=set()
class PixelCustomCompositeTests(unittest.TestCase):
    def test_all6_original_raw_modes_capture45_and_modulo_is_honest_functional(self):
        for raw,mode in CASES.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);row=catalog.brushes[0];d=row['descriptor']
                self.assertEqual(d['version'],45);self.assertEqual(d['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(d['sourceStamp']['settings']['CompositeOp'],raw);self.assertEqual(path.read_bytes(),source)
                notes=[n for n in row.get('compatibility',[])if n['feature']=='customCompositeFunctional']
                if raw in CASES:
                    self.assertEqual(len(notes),1);self.assertEqual(notes[0]['status'],'approximate');self.assertIn('defined-custom-rgba-u8-v1',notes[0]['detail'])
                else:self.assertEqual(notes,[])
    def test_old_revisions_unchanged_and_new_child_propagates45(self):
        for raw,version in [('normal',27),('grain_merge',38),('glow_heat',39),('penumbra b',40),('xor',41),('color_hsv',42),('modulo_shift',43),('tangent_normalmap',44)]:
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog);self.assertEqual(catalog.brushes[0]['descriptor']['version'],version)
        with tempfile.TemporaryDirectory() as tmp:
            fields='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">greater</param>'
            path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(resources=fields));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog);d=catalog.brushes[0]['descriptor'];self.assertEqual(d['version'],45);self.assertEqual(d['behavior']['dual']['brush']['version'],45)
