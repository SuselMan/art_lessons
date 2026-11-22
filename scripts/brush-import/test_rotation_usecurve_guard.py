"""Original Pixel presets must not silently disable a checked rotation."""
from pathlib import Path
import tempfile
import unittest
import zipfile
import convert
from krita_import import convert_krita
from test_krita import kpp

class RotationUseCurveGuardTests(unittest.TestCase):
    def test_kpp_and_bundle(self):
        cases = [('yes', 'true', True), ('no', 'true', True), ('true', 'true', False), ('false', 'true', False), ('1', 'true', False), ('0', 'true', False), (None, 'true', False), ('yes', 'false', False)]
        for suffix in ('.kpp', '.bundle'):
            for value, checked, rejected in cases:
                with self.subTest(suffix=suffix, value=value, checked=checked), tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
                    props = '<param name="PressureRotation">'+checked+'</param>'
                    props += '<param name="RotationSensor"><![CDATA[<params id="drawingangle"/>]]></param>'
                    if value is not None:
                        props += '<param name="RotationUseCurve">'+value+'</param>'
                    raw = kpp(resources=props)
                    path = Path(tmp)/('test'+suffix)
                    if suffix == '.bundle':
                        with zipfile.ZipFile(path, 'w') as archive:
                            archive.writestr('paintoppresets/brush.kpp', raw)
                    else:
                        path.write_bytes(raw)
                    catalog = convert.Catalog(Path(tmp)/'out')
                    convert_krita(path, catalog)
                    if rejected:
                        self.assertFalse(catalog.brushes)
                        self.assertIn('Unsupported noncanonical RotationUseCurve', str(catalog.skipped))
                    else:
                        self.assertEqual(catalog.skipped, [])
                        self.assertEqual(len(catalog.brushes), 1)
