from pathlib import Path
import tempfile
import unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset

class SketchTests(unittest.TestCase):
    def convert(self,extra=''):
        data=kpp(engine='sketchbrush',resources='<param name="Sketch/simpleMode">true</param>'+extra)
        with tempfile.TemporaryDirectory() as d:return preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_simple_connection_configuration(self):
        b=self.convert('<param name="Sketch/lineWidth">4</param><param name="Sketch/offset">10</param>')
        self.assertEqual(b['descriptor']['version'],44);self.assertEqual(b['descriptor']['sketch']['width'],4);self.assertEqual(b['descriptor']['sketch']['offset'],.1)
        self.assertEqual(b['descriptor']['behavior']['rendering']['accumulation'],'directOver')
    def test_mask_mode_is_not_silently_approximated(self):
        data=kpp(engine='sketchbrush')
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'mask-selected'):preset(data,'test.kpp',Catalog(Path(d)),{})
    def test_active_timer_is_explicit(self):
        with self.assertRaisesRegex(ValueError,'timed input'):self.convert('<param name="PaintOpSettings/isAirbrushing">true</param>')
    def test_line_width_sensor_and_constant_value(self):
        b=self.convert('<param name="PressureLine width">true</param><param name="Line widthUseCurve">false</param><param name="Line widthValue">0.5</param>')
        self.assertEqual(b['descriptor']['sketch']['dynamics']['width'][0]['curve'],[[0,.5],[1,.5]])
