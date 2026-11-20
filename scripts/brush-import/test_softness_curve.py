import math
import unittest
from curve_transfer import native_transfer
from softness_curve import (compile_softness_basis, raw_softness_basis,
                            sample_softness_basis, MAX_RESOLUTION)


class SoftnessCurveTests(unittest.TestCase):
    def test_native_two_knot_midpoint_and_inverted_endpoints(self):
        for curve, expected in [('0,0;1,1', (0, 1)), ('0,1;1,0', (1, 0))]:
            zero, one = raw_softness_basis(curve, 3)  # R+2=5: midpoint is index2.
            self.assertEqual(len(zero), 5)
            self.assertEqual((zero[0], zero[-1]), expected)
            self.assertEqual((one[0], one[-1]), expected)
            self.assertEqual(zero[2], 0)
            self.assertEqual(one[2], .5)
        # A single authored knot has no interior to transform.
        self.assertEqual(raw_softness_basis('.2,.7', 1), ((.7,)*3, (.7,)*3))

    def test_corner_is_preserved_and_natural_runs_do_not_cross_it(self):
        zero, one = raw_softness_basis('0,0;.5,1,is_corner;1,0', 3)
        self.assertEqual(zero, (0, 0, 0, 0, 0))
        self.assertEqual(one, (0, .5, 1, .5, 0))
        smooth = raw_softness_basis('0,0;.5,1;1,0', 3)[1]
        self.assertEqual(smooth[1], .6875)
        self.assertEqual(smooth[3], .6875)

    def test_raw_affine_basis_reconstructs_native_transformed_transfer(self):
        curves = ['0,0;1,1', '0,1;1,0', '0,.2;.2,.9;.55,.1,is_corner;1,.7',
                  '0,0;.25,1;.5,0;1,0']
        for curve in curves:
            basis = compile_softness_basis(curve, 16)
            records = [r.split(',') for r in curve.split(';')]
            if len(records) == 2:
                a, b = records
                records.insert(1, [str((float(a[0])+float(b[0]))/2), str((float(a[1])+float(b[1]))/2)])
            for softness in [0, .1, .375, .5, .9, 1]:
                transformed = ';'.join(','.join([r[0], str(float(r[1]) * (softness if 0<i<len(records)-1 else 1)), *r[2:]]) for i,r in enumerate(records))
                transfer = native_transfer(transformed, basis['resolution']+2)
                expected = transfer['samples'] if isinstance(transfer, dict) else [i/(basis['resolution']+1) for i in range(basis['resolution']+2)]
                for index, value in enumerate(expected[:-1]):
                    actual = sample_softness_basis(basis, index/basis['resolution'], softness)
                    self.assertLessEqual(abs(actual-value), basis['span']/0xffffffff + 2e-14, (curve,softness,index))

    def test_clamp_must_follow_softness_mix_and_precede_radial_interpolation(self):
        curve='0,1;.25,0;.5,1;1,0'
        zero, one = raw_softness_basis(curve, 63)
        # The natural spline undershoots zero: clamped endpoint LUTs lose data.
        self.assertLess(min(one), 0)
        largest = max(abs(max(0,min(1,a+(b-a)*.5)) - (max(0,min(1,a)) + max(0,min(1,b)))*.5) for a,b in zip(zero,one))
        self.assertGreater(largest, .1)
        basis=compile_softness_basis(curve, 15.75)
        # Independent transfer values are clamped first; sample between them.
        target=native_transfer('0,1;.25,0;.5,.5;1,0',65)['samples']
        for i in range(63):
            expected=(target[i]+target[i+1])*.5
            self.assertLessEqual(abs(sample_softness_basis(basis,(i+.5)/63,.5)-expected),basis['span']/0xffffffff+2e-14)

    def test_bounded_payload_and_invalid_inputs(self):
        maximum=compile_softness_basis('0,0;1,1',10000)
        self.assertEqual(maximum['resolution'],MAX_RESOLUTION)
        self.assertEqual(len(maximum['payload']),8*(MAX_RESOLUTION+2))
        for curve in ['', '0,0;0,1', '1,0;0,1', '0,NaN;1,1', '0,-1;1,0', '0,0,unknown;1,1', ';'.join(f'{i/256},0' for i in range(257))]:
            with self.subTest(curve=curve[:40]),self.assertRaises(ValueError):
                compile_softness_basis(curve,10)
        for diameter in [True,0,-1,10001,math.nan,math.inf,.01]:
            with self.assertRaises(ValueError):compile_softness_basis('0,0;1,1',diameter)
        valid=compile_softness_basis('0,.5;1,.5',1)
        for update in [{'payload':bytearray(valid['payload'])},{'payload':b''},{'minimum':math.inf},{'span':0},{'resolution':True},{'unexpected':1}]:
            with self.assertRaises(ValueError):sample_softness_basis({**valid,**update},.5,.5)
        for q,s in [(math.nan,.5),(.5,math.inf),(.5,-1),(.5,True)]:
            with self.assertRaises(ValueError):sample_softness_basis(valid,q,s)
        self.assertEqual(sample_softness_basis(valid,1.01,.5),0)


if __name__ == '__main__':
    unittest.main()
