"""Curve Wash must not silently become BuildUp."""
import tempfile
import unittest
from pathlib import Path

from brush_contract import Catalog
from krita_import import preset
from test_krita import kpp


class CurveWashGuardTests(unittest.TestCase):
    def test_explicit_wash_rejected_with_and_without_timer(self):
        for action in ('2', '0', '3', 'garbage'):
            for timer in ('', '<param name="PaintOpSettings/isAirbrushing">true</param>'):
                with self.subTest(action=action, timer=bool(timer)), tempfile.TemporaryDirectory() as tmp:
                    data = kpp(engine='curvebrush', resources='<param name="PaintOpAction">'+action+'</param>'+timer)
                    with self.assertRaisesRegex(ValueError, 'Unsupported Curve PaintOpAction'):
                        preset(data, 'curve.kpp', Catalog(Path(tmp)), {}, timed_input=True)

    def test_explicit_buildup_still_imports(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = kpp(engine='curvebrush', resources='<param name="PaintOpAction">1</param>')
            result = preset(data, 'curve.kpp', Catalog(Path(tmp)), {})
            self.assertEqual(result['descriptor']['behavior']['rendering']['accumulation'], 'directOver')
