"""An omitted mode must not silently become BuildUp for these paintops."""
import tempfile
import unittest
from pathlib import Path

from brush_contract import Catalog
from krita_import import preset
from test_krita import kpp


class ImplicitWashTests(unittest.TestCase):
    def test_missing_action_is_rejected_for_each_engine(self):
        for engine in ('sketchbrush', 'curvebrush', 'particlebrush', 'gridbrush', 'spraybrush'):
            with self.subTest(engine=engine), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaisesRegex(ValueError, 'Implicit Krita Wash'):
                    preset(kpp(engine=engine, implicit_action=True), 'implicit.kpp', Catalog(Path(tmp)), {})

    def test_explicit_buildup_remains_available(self):
        for engine in ('sketchbrush', 'curvebrush', 'particlebrush', 'gridbrush', 'spraybrush'):
            with self.subTest(engine=engine), tempfile.TemporaryDirectory() as tmp:
                result = preset(kpp(engine=engine, resources='<param name="PaintOpAction">1</param>'), 'explicit.kpp', Catalog(Path(tmp)), {})
                self.assertEqual(result['descriptor']['behavior']['rendering']['accumulation'], 'directOver')

    def test_pixel_implicit_action_remains_available(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = preset(kpp(), 'pixel.kpp', Catalog(Path(tmp)), {})
            self.assertEqual(result['descriptor']['behavior']['rendering']['accumulation'], 'directOver')

    def test_explicit_supported_wash_remains_available(self):
        for engine in ('sketchbrush', 'particlebrush', 'gridbrush', 'spraybrush'):
            with self.subTest(engine=engine), tempfile.TemporaryDirectory() as tmp:
                result = preset(kpp(engine=engine, resources='<param name="PaintOpAction">2</param>'), 'wash.kpp', Catalog(Path(tmp)), {})
                self.assertEqual(result['descriptor']['behavior']['rendering']['accumulation'], 'alphaDarken')
