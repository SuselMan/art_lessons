import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp

class PixelChannelCompositeTests(unittest.TestCase):
    def test_registered_native_modes_survive_actual_import_without_normal_approximation(self):
        cases={'equivalence':'equivalence','additive_subtractive':'additiveSubtractive','arc_tangent':'arcTangent','negation':'negation','inverse_subtract':'inverseSubtract','grain_merge':'grainMerge','grain_extract':'grainExtract','allanon':'allanon','geometric_mean':'geometricMean','parallel':'parallel','luminize':'luminosity'}
        for raw,mode in cases.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[])
                descriptor=catalog.brushes[0]['descriptor']
                self.assertEqual(descriptor['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(descriptor['version'],38)
                self.assertEqual(descriptor['sourceStamp']['settings']['CompositeOp'],raw)
                self.assertFalse(any('normal used' in n.get('detail','') for n in catalog.brushes[0].get('compatibility',[])))

    def test_selective_revision_does_not_upgrade_unchanged_normal_and_propagates_affected_child(self):
        for child_mode in [None,'grain_merge']:
            with self.subTest(child_mode=child_mode),tempfile.TemporaryDirectory() as tmp:
                fields='' if child_mode is None else '<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">'+child_mode+'</param>'
                source=kpp(mode='normal',resources=fields)
                path=Path(tmp)/'authored.kpp';path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);d=catalog.brushes[0]['descriptor']
                self.assertEqual(path.read_bytes(),source)
                if child_mode is None:self.assertEqual(d['version'],27)
                else:
                    self.assertEqual(d['version'],38)
                    self.assertEqual(d['behavior']['dual']['brush']['version'],38)
                    self.assertEqual(d['behavior']['dual']['brush']['behavior']['rendering']['blendMode'],'grainMerge')
