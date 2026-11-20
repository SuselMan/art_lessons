"""Authored constant Sharpness fixtures; no stock artwork required."""
import unittest
import test_krita_random_color

class MaskThresholdTests(unittest.TestCase):
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
        b=self.brush({'PressureSharpness':'true','SharpnessSensor':'<params id="time"/>','SharpnessValue':'.4'})
        self.assertNotIn('alphaThreshold',b['descriptor']['tip'])
        self.assertNotIn('sharpness',b['descriptor'].get('behavior',{}).get('modulations',{}))
        self.assertTrue(any(n['feature']=='maskThreshold' and n['status']=='unsupported' for n in b['compatibility']))

    def test_common_curve_and_softness_are_independent(self):
        b=self.brush({'PressureSharpness':'true','SharpnesscommonCurve':'0,0;1,0.603015;','Sharpness/softness':'25'})['descriptor']
        self.assertEqual(b['tip']['alphaThreshold'],{'value':1,'softness':.25})
        curve=b['behavior']['modulations']['sharpness'][0]['curve']
        self.assertAlmostEqual(curve[-1][1] if isinstance(curve,list) else curve['samples'][-1],.603015,places=5)
