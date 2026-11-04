import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp

CASES={'reflect': 'reflect', 'glow': 'glow', 'freeze': 'freeze', 'heat': 'heat', 'glow_heat': 'glowHeat', 'heat_glow': 'heatGlow', 'reflect_freeze': 'reflectFreeze', 'freeze_reflect': 'freezeReflect', 'heat_glow_freeze_reflect_hybrid': 'heatGlowFreezeReflectHybrid'}
class PixelQuadraticCompositeTests(unittest.TestCase):
    def test_registered_quadratic_family_retains_original_raw_and_revision39(self):
        for raw,mode in CASES.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[])
                d=catalog.brushes[0]['descriptor']
                self.assertEqual(d['version'],39)
                self.assertEqual(d['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(d['sourceStamp']['settings']['CompositeOp'],raw)
                self.assertEqual(path.read_bytes(),source)

    def test_only_affected_original_or_child_gets_new_revision(self):
        for child in [None,'glow_heat','grain_merge']:
            with self.subTest(child=child),tempfile.TemporaryDirectory() as tmp:
                fields='' if child is None else '<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">'+child+'</param>'
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode='normal',resources=fields))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);d=catalog.brushes[0]['descriptor']
                self.assertEqual(d['version'],27 if child is None else 39 if child=='glow_heat' else 38)
                if child:self.assertEqual(d['behavior']['dual']['brush']['version'],d['version'])
        for raw,version in [('normal',27),('grain_merge',38)]:
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.brushes[0]['descriptor']['version'],version)
