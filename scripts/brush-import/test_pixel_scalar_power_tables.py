import tempfile
import unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelScalarPowerTablesTests(unittest.TestCase):
    def test_only_five_unshipped43_modes_record_canonical_power_law_and_preserve_root_cos_note(self):
        power=('easy dodge','easy burn','pnorm_a','super_light','soft_light_ifs_illusions')
        roots=('pnorm_b','tint_ifs_illusions','interpolation','interpolation 2x')
        for raw in power+roots+('gamma_dark','normal'):
            with self.subTest(raw=raw),tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'input.kpp';source=kpp(mode=raw);path.write_bytes(source)
                catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
                self.assertEqual(catalog.skipped,[]);row=catalog.brushes[0]
                notes=[n for n in row.get('compatibility',[])if n['feature']=='scalarPowerFunctional']
                self.assertEqual(bool(notes),raw in power)
                if notes:
                    self.assertEqual(row['descriptor']['version'],43);self.assertEqual(notes[0]['status'],'approximate')
                    self.assertIn('defined-scalar23-power-u8-v1',notes[0]['detail']);self.assertIn('not native',notes[0]['detail'])
                root_notes=[n for n in row.get('compatibility',[])if n['feature']=='scalarRootCosFunctional']
                self.assertEqual(bool(root_notes),raw in roots)
                self.assertEqual(row['descriptor']['version'],27 if raw=='normal' else 43)
                self.assertEqual(path.read_bytes(),source)
