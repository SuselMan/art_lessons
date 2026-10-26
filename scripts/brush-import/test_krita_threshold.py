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

    def test_active_response_is_not_substituted_and_alignment_is_explicit(self):
        brush=self.brush({'PressureSharpness':'true','SharpnessUseCurve':'true','SharpnessValue':'.4','Sharpness/alignoutline':'true'})
        self.assertNotIn('alphaThreshold',brush['descriptor']['tip'])
        self.assertTrue(any(n['feature']=='maskThreshold' and n['status']=='unsupported' for n in brush['compatibility']))
        self.assertTrue(any(n['feature']=='maskThresholdAlignment' for n in brush['compatibility']))

    def test_softness_percent_and_legacy_factor_migration(self):
        params={'PressureSharpness':'true','SharpnessUseCurve':'false','SharpnessValue':'.5','Sharpness/softness':'25'}
        self.assertEqual(self.brush(params)['descriptor']['tip']['alphaThreshold'],{'value':.5,'softness':.25})
        del params['SharpnessValue'];params['Sharpness/factor']='.6'
        self.assertEqual(self.brush(params)['descriptor']['tip']['alphaThreshold'],{'value':.6,'softness':.6})
