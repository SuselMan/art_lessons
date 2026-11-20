"""Authored KPP Mirror option; no redistributed native brush pixels."""
from pathlib import Path
import tempfile,unittest
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
class HatchingMirrorTests(unittest.TestCase):
    def convert(self,extra):
        data=kpp(engine='hatchingbrush',resources=extra)
        with tempfile.TemporaryDirectory()as d:return preset(data,'Authored Hatching Mirror.kpp',Catalog(Path(d)),{})
    def test_active_mirror_opts_into94_preserves_axes_and_pressure_curve(self):
        d=self.convert('<param name="PressureMirror">true</param><param name="HorizontalMirrorEnabled">true</param><param name="VerticalMirrorEnabled">true</param><param name="MirrorValue">1</param><param name="MirrorUseCurve">true</param><param name="MirrorSensor"><![CDATA[<params id="pressure"><curve>0,0;1,1;</curve></params>]]></param>')['descriptor']
        self.assertEqual(d['version'],94);self.assertTrue(d['behavior']['mirror']['horizontal']);self.assertTrue(d['behavior']['mirror']['vertical'])
        self.assertEqual(d['behavior']['mirror']['dynamics'][0]['control'],'pressure');self.assertIn('hatching',d)
    def test_disabled_parent_and_existing_opaque67_are_unchanged(self):
        d=self.convert('<param name="PressureMirror">false</param><param name="HorizontalMirrorEnabled">true</param><param name="Hatching/bool_opaquebackground">true</param>')['descriptor']
        self.assertEqual(d['version'],67);self.assertNotIn('mirror',d['behavior']);self.assertTrue(d['hatching']['opaqueBackground'])
    def test_checked_constant_mirror_does_not_require_fake_pressure(self):
        d=self.convert('<param name="PressureMirror">true</param><param name="VerticalMirrorEnabled">true</param><param name="MirrorUseCurve">false</param><param name="MirrorValue">0.5</param>')['descriptor']
        self.assertEqual(d['version'],94);self.assertEqual(d['behavior']['mirror']['value'],.5);self.assertFalse(d['behavior']['mirror']['horizontal']);self.assertTrue(d['behavior']['mirror']['vertical'])
