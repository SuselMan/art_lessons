import unittest
from curve_transfer import native_transfer,scaled_curve


def at(curve,x):
    table=curve['samples'];p=x*255;i=int(p);fraction=p-i
    return table[i]+(table[min(255,i+1)]-table[i])*fraction


class NativeTransferTests(unittest.TestCase):
    def test_basic5_independent_diameter_witness(self):
        curve=native_transfer('0,0;.35,.1;1,1;')
        self.assertEqual(len(curve['samples']),256)
        self.assertAlmostEqual(at(curve,.5)*40,9.391572849118763,places=12)
        self.assertAlmostEqual(at(curve,.175)*40,.9905032192985442,places=12)
        self.assertEqual(curve['endpointEpsilon'],1e-6)
        self.assertEqual(native_transfer('0,0;.4,.4;1,1;'),[[0,0],[1,1]])
    def test_native_knots_clamp_without_inserting_fake_spline_endpoints(self):
        curve=native_transfer('.2,.3;.5,.4;.8,.9;')
        self.assertEqual(curve['samples'][0],.3)
        self.assertEqual(curve['samples'][-1],.9)
        self.assertLess(abs(at(curve,.35)-.3125),.00001)
        incorrect=native_transfer('0,.3;.2,.3;.5,.4;.8,.9;1,.9;')
        self.assertGreater(abs(at(curve,.35)-at(incorrect,.35)),.01)
    def test_corner_knots_and_constant_curves(self):
        smooth=native_transfer('0,0;.35,.1;1,1;')
        corner=native_transfer('0,0;.35,.1,is_corner;1,1;')
        self.assertAlmostEqual(at(corner,.175),.05,places=12)
        self.assertGreater(at(corner,.175)-at(smooth,.175),.025)
        self.assertEqual(native_transfer('.3,.7;')['samples'],[.7]*256)
        self.assertEqual(scaled_curve(native_transfer('.3,.7;'),3)['samples'],[.7*3]*256)
    def test_overshoot_is_clamped_and_bad_knots_rejected(self):
        curve=native_transfer('0,0;.1,1;.2,0;1,1;')
        self.assertTrue(all(0<=v<=1 for v in curve['samples']))
        for text in ['','0,0;0,1;','0,nan;1,1;','1,1;0,0;','0,0;1e-320,1;1,1;']:
            with self.assertRaises(ValueError):native_transfer(text)
