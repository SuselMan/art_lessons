"""Authored constant Sharpness fixtures; no stock artwork required."""
import unittest
import test_krita_random_color
import base64,copy,json,tempfile
from pathlib import Path
from brush_contract import Catalog
from krita_import import convert_krita
from convert import portable_bundle
from test_krita import kpp
from test_krita_variable_gih import frame,pipe

class MaskThresholdTests(unittest.TestCase):
    def test_constant_alignment_of_equal_random_bitmap_frames_roundtrips(self):
        definition='<Brush type="gbr_brush" filename="own.gih" spacing="0.1" scale="1"/>'
        extra='<param name="PressureSharpness">true</param><param name="SharpnessUseCurve">false</param><param name="SharpnessValue">0.47</param><param name="Sharpness/alignoutline">true</param><param name="PaintOpAction">2</param>'
        gih=pipe([frame(6,4,[30]*24),frame(6,4,[80]*24)],'random')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'own.kpp';path.write_bytes(kpp(definition,extra));c=Catalog(root/'native');convert_krita(path,c,{'own.gih':gih});self.assertEqual(c.skipped,[])
            d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],211);self.assertEqual(d['tip']['alphaThreshold']['alignment'],{'width':1,'height':4/6});self.assertFalse(any(n['status']=='unsupported' for n in c.brushes[0]['compatibility']))
            assets={aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()};env={'library':c.write(),'assets':assets};file=root/'portable.json';file.write_text(json.dumps(env));out=Catalog(root/'out');portable_bundle(file,out);self.assertEqual(out.brushes,c.brushes)
            bad=copy.deepcopy(env);bad['library']['brushes'][0]['descriptor']['version']=27;file.write_text(json.dumps(bad))
            with self.assertRaises(ValueError):portable_bundle(file,Catalog(root/'bad'))
    def brush(self,params):
        return test_krita_random_color.RandomOptionTests().brush(params)

    def test_constant_and_disabled_sharpness(self):
        params={'PressureSharpness':'true','SharpnessUseCurve':'false','SharpnessValue':'1','Sharpness/threshold':'0.1'}
        self.assertEqual(self.brush(params)['descriptor']['tip']['alphaThreshold'],{'value':1,'softness':0})
        params['PressureSharpness']='false'
        self.assertNotIn('alphaThreshold',self.brush(params)['descriptor']['tip'])

    def test_active_response_is_transferred_and_alignment_is_explicit(self):
        brush=self.brush({'PressureSharpness':'true','SharpnessUseCurve':'true','SharpnessValue':'.4','Sharpness/alignoutline':'true'})
        self.assertEqual(brush['descriptor']['tip']['alphaThreshold'],{'value':.4,'softness':0})
        self.assertEqual(brush['descriptor']['behavior']['modulations']['sharpness'][0]['control'],'pressure')
        self.assertEqual(brush['descriptor']['version'],28)
        self.assertTrue(any(n['feature']=='maskThresholdAlignment' for n in brush['compatibility']))

    def test_softness_percent_and_legacy_factor_migration(self):
        params={'PressureSharpness':'true','SharpnessUseCurve':'false','SharpnessValue':'.5','Sharpness/softness':'25'}
        self.assertEqual(self.brush(params)['descriptor']['tip']['alphaThreshold'],{'value':.5,'softness':.25})
        del params['SharpnessValue'];params['Sharpness/factor']='.6'
        self.assertEqual(self.brush(params)['descriptor']['tip']['alphaThreshold'],{'value':.6,'softness':.6})

    def test_unsupported_sensor_does_not_become_a_constant(self):
        b=self.brush({'PressureSharpness':'true','SharpnessSensor':'<params id="perspective"/>','SharpnessValue':'.4'})
        self.assertNotIn('alphaThreshold',b['descriptor']['tip'])
        self.assertNotIn('sharpness',b['descriptor'].get('behavior',{}).get('modulations',{}))
        self.assertTrue(any(n['feature']=='maskThreshold' and n['status']=='unsupported' for n in b['compatibility']))

    def test_time_sensor_uses_recorded_stroke_clock(self):
        b=self.brush({'PressureSharpness':'true','SharpnessSensor':'<params id="time"/>','SharpnessValue':'.4'})
        self.assertEqual(b['descriptor']['behavior']['modulations']['sharpness'][0]['control'],'time')
        self.assertFalse(any(n['feature']=='maskThreshold' and n['status']=='unsupported' for n in b['compatibility']))

    def test_common_curve_and_softness_are_independent(self):
        b=self.brush({'PressureSharpness':'true','SharpnesscommonCurve':'0,0;1,0.603015;','Sharpness/softness':'25'})['descriptor']
        self.assertEqual(b['tip']['alphaThreshold'],{'value':1,'softness':.25})
        curve=b['behavior']['modulations']['sharpness'][0]['curve']
        self.assertAlmostEqual(curve[-1][1] if isinstance(curve,list) else curve['samples'][-1],.603015,places=5)
