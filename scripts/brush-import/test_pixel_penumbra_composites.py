import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
CASES={'hard_mix_softer_photoshop': 'hardMixSofterPhotoshop', 'penumbra a': 'penumbraA', 'penumbra b': 'penumbraB', 'penumbra c': 'penumbraC', 'penumbra d': 'penumbraD', 'flat_light': 'flatLight'}
class PixelPenumbraCompositeTests(unittest.TestCase):
    def test_exact_registered_raws_have_revision40_and_retained_source(self):
        for raw,mode in CASES.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);d=catalog.brushes[0]['descriptor']
                self.assertEqual(d['version'],40)
                self.assertEqual(d['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(d['sourceStamp']['settings']['CompositeOp'],raw)
                self.assertEqual(path.read_bytes(),source)

    def test_unaffected_rows_and_affected_child_preserve_immutable_revision_scope(self):
        for raw,version in [('normal',27),('grain_merge',38),('glow_heat',39)]:
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.brushes[0]['descriptor']['version'],version)
        with tempfile.TemporaryDirectory() as tmp:
            fields='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">penumbra b</param>'
            path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode='normal',resources=fields))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
            self.assertEqual(catalog.skipped,[]);d=catalog.brushes[0]['descriptor']
            self.assertEqual(d['version'],40);self.assertEqual(d['behavior']['dual']['brush']['version'],40)
            self.assertEqual(d['behavior']['dual']['brush']['behavior']['rendering']['blendMode'],'penumbraB')
