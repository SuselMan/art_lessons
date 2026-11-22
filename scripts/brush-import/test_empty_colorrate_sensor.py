"""An empty native ColorRate sensor uses pressure; malformed XML still fails."""
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from convert import Catalog
from krita_import import convert_krita
from test_krita import kpp


def brush(sensor, custom):
    props = (f'<param name="PressureColorRate">true</param>'
             f'<param name="ColorRateValue">.7</param>'
             f'<param name="ColorRateUseCurve">true</param>'
             f'<param name="ColorRateSensor"><![CDATA[{sensor}]]></param>'
             f'<param name="CustomColorRate">{custom}</param>'
             f'<param name="CurveColorRate">0,1;1,0;</param>')
    return kpp(engine='colorsmudge', resources=props)


class EmptyColorRateSensorTests(unittest.TestCase):
    def test_public_kpp_legacy_curve_and_malformed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for custom in ('false', 'true'):
                with self.subTest(custom=custom):
                    path = root / (custom + '.kpp')
                    path.write_bytes(brush('', custom))
                    catalog = Catalog(root / ('out-' + custom))
                    convert_krita(path, catalog)
                    self.assertEqual(catalog.skipped, [])
                    controls = catalog.brushes[0]['descriptor']['mixer']['foreground']['dynamics']
                    self.assertEqual(controls[0]['control'], 'pressure')
                    curve = controls[0]['curve']
                    if custom == 'false':
                        self.assertEqual(curve, [[0, 0], [1, 1]])
                    else:
                        self.assertEqual((curve['samples'][0], curve['samples'][-1]), (1, 0))
            path = root / 'invalid.kpp'; path.write_bytes(brush('<params', 'true'))
            catalog = Catalog(root / 'invalid-out'); convert_krita(path, catalog)
            self.assertEqual(catalog.brushes, [])
            self.assertEqual(len(catalog.skipped), 1)

    def test_bundle_isolates_malformed_neighbor(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); path = root / 'brushes.bundle'
            with ZipFile(path, 'w') as archive:
                archive.writestr('a.kpp', brush('', 'true'))
                archive.writestr('b.kpp', brush('<params', 'true'))
                archive.writestr('c.kpp', brush('<params id="pressure"/>', 'false'))
            catalog = Catalog(root / 'out'); convert_krita(path, catalog)
            self.assertEqual([b['source'] for b in catalog.brushes], ['a.kpp', 'c.kpp'])
            self.assertEqual([s['name'] for s in catalog.skipped], ['b'])


if __name__ == '__main__':
    unittest.main()
