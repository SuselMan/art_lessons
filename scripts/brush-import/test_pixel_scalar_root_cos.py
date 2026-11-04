import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelScalarRootCosTests(unittest.TestCase):
    def test_only_four_unshipped43_modes_record_explicit_functional_numeric_note(self):
        for raw in ('pnorm_b','tint_ifs_illusions','interpolation','interpolation 2x','gamma_dark','normal'):
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'input.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);row=catalog.brushes[0]
                expected=raw in ('pnorm_b','tint_ifs_illusions','interpolation','interpolation 2x')
                notes=[n for n in row.get('compatibility',[])if n['feature']=='scalarRootCosFunctional']
                self.assertEqual(bool(notes),expected)
                if expected:
                    self.assertEqual(row['descriptor']['version'],43)
                    self.assertEqual(notes[0]['status'],'approximate')
                    self.assertIn('defined-scalar23-root-cos-q65535-v1',notes[0]['detail'])
                self.assertEqual(path.read_bytes(),source)
