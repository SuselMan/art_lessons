import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
CASES={'xor': 'binaryXor', 'or': 'binaryOr', 'and': 'binaryAnd', 'nand': 'binaryNand', 'nor': 'binaryNor', 'xnor': 'binaryXnor', 'implication': 'binaryImplication', 'not_implication': 'binaryNotImplication', 'converse': 'binaryConverse', 'not_converse': 'binaryNotConverse'}
class PixelBinaryCompositeTests(unittest.TestCase):
    def test_actual_originals_capture_defined_functional_law_honestly_and_revision41(self):
        for raw,mode in CASES.items():
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);row=catalog.brushes[0];d=row['descriptor']
                self.assertEqual(d['version'],41);self.assertEqual(d['behavior']['rendering']['blendMode'],mode)
                self.assertEqual(d['sourceStamp']['settings']['CompositeOp'],raw);self.assertEqual(path.read_bytes(),source)
                notes=[n for n in row['compatibility'] if n['feature']=='binaryCompositeFunctional']
                self.assertEqual(len(notes),1);self.assertEqual(notes[0]['status'],'approximate')
                self.assertIn('defined-uint32-wrap-u8-v1',notes[0]['detail']);self.assertIn('not claimed',notes[0]['detail'])
    def test_previous_immutable_revisions_and_dual_child_are_preserved(self):
        for raw,version in [('normal',27),('grain_merge',38),('glow_heat',39),('penumbra b',40)]:
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(mode=raw))
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.brushes[0]['descriptor']['version'],version)
        with tempfile.TemporaryDirectory() as tmp:
            fields='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MasterSizeCoeff">.5</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="20" ratio="1"/></Brush>]]></param><param name="MaskingBrush/Preset/CompositeOp">not_converse</param>'
            path=Path(tmp)/'authored.kpp';path.write_bytes(kpp(resources=fields))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog);d=catalog.brushes[0]['descriptor']
            self.assertEqual(d['version'],41);self.assertEqual(d['behavior']['dual']['brush']['version'],41)
            self.assertEqual(d['behavior']['dual']['brush']['behavior']['rendering']['blendMode'],'binaryNotConverse')
