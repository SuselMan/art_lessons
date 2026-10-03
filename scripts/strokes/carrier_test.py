"""Conservation and causal-clock tests for the isolated solver."""
import unittest
import numpy as np
from carrier import Brush, Carrier, Params, footprint, transport
from carrier_replay import RecordedClock


class CarrierTests(unittest.TestCase):
    def test_face_transport_preserves_mass_and_positive_amounts(self):
        rng = np.random.default_rng(680)
        for _ in range(100):
            w = rng.uniform(0, 2, (12, 9))
            w[::3, ::2] = 0
            p = w * rng.uniform(0, 5, w.shape)
            qx = rng.uniform(-10, 10, (12, 8))
            qy = rng.uniform(-10, 10, (11, 9))
            wn, pn = transport(w, p, qx, qy)
            self.assertAlmostEqual(wn.sum(), w.sum(), places=10)
            self.assertAlmostEqual(pn.sum(), p.sum(), places=10)
            self.assertGreaterEqual(wn.min(), -1e-14)
            self.assertGreaterEqual(pn.min(), -1e-14)
            wc, pc = transport(w, .7 * w, qx, qy)
            np.testing.assert_allclose(pc, .7 * wc, atol=1e-14)

    def test_brush_pickup_return_settle_and_evaporation_close_balance(self):
        y, x = np.indices((32, 32))
        sim = Carrier((x + y) / 62)
        brush = Brush(140, 17, 140, 60)
        start = sim.totals(brush)
        for tick in range(120):
            f = footprint(sim.w.shape, 10 + tick / 12, 16, 7, 1.4, .2)
            sim.step(1 / 120, f, (10, 0), brush)
        for _ in range(120):
            sim.step(1 / 120)
        sim.dry_all()
        np.testing.assert_allclose(sim.totals(brush), start, rtol=1e-12, atol=1e-12)
        self.assertEqual(sim.p.max(), 0)
        self.assertEqual(sim.w.max(), 0)
        self.assertGreater(sim.d.sum(), 0)
        for a in [sim.w, sim.s, sim.p, sim.d]:
            self.assertGreaterEqual(a.min(), -1e-12)

    def test_inactive_dry_state_does_not_change(self):
        sim = Carrier(np.full((5, 7), .5))
        sim.d[2, 3] = .8
        for _ in range(20):
            sim.step(1 / 120)
        self.assertEqual(sim.d[2, 3], .8)
        self.assertEqual(sim.d.sum(), .8)

    def test_no_pigment_can_cross_a_dry_gap_by_diffusion(self):
        sim = Carrier(np.full((5, 7), .5), Params(flow=0, absorb=0, evaporation=0, settle=0))
        sim.w[:, :2] = 1
        sim.w[:, 3:] = 1
        sim.p[:, :2] = 2
        for _ in range(100):
            sim.step(1 / 120)
        self.assertEqual(sim.p[:, 2:].max(), 0)

    def test_recorded_clock_independent_of_batch_sizes_and_timestamp_duplicates(self):
        rng = np.random.default_rng(9)
        ds = rng.uniform(0, 1, (80, 10))
        ds[:, 9] = np.repeat(np.arange(40) * 5., 2)
        ds[:, 7] = np.linspace(3., 3.5, 80)
        def collect(batch):
            clock = RecordedClock()
            result = []
            for start in range(0, len(ds), batch):
                result.extend(clock.feed(ds[start:start + batch]))
            result.extend(clock.finish())
            return np.array(result)
        reference = collect(80)
        for batch in [1, 2, 7, 32]:
            np.testing.assert_array_equal(reference, collect(batch))

    def test_clock_rejects_reversed_time(self):
        ds = np.zeros((2, 10))
        ds[:, 9] = [10, 5]
        with self.assertRaises(ValueError):
            list(RecordedClock().feed(ds))

    def test_clock_rejects_invalid_steps(self):
        for dt in [0, -1, float('nan'), float('inf')]:
            with self.assertRaises(ValueError):
                RecordedClock(dt)

    def test_dry_hairs_release_a_finite_pigment_stock_without_water(self):
        sim = Carrier(np.full((10, 10), .5))
        brush = Brush(0, 0, 100, 3)
        for _ in range(100):
            sim.step(1 / 120, np.ones((10, 10)), (0, 0), brush)
        self.assertAlmostEqual(sim.totals(brush)[1], 3, places=12)
        self.assertGreater(sim.d.sum(), 0)
        self.assertGreater(brush.loaded_pigment, 0)

    def test_brush_motion_moves_both_water_and_pigment_without_diluting_uniform_concentration(self):
        params = Params(flow=0, absorb=0, evaporation=0, settle=0, lift=0)
        sim = Carrier(np.full((32, 32), .5), params)
        sim.w.fill(.3)
        sim.p = .7 * sim.w
        initial = sim.totals()
        contact = footprint(sim.w.shape, 16, 16, 10, 1, 0)
        x = np.indices(sim.w.shape)[1]
        centre_before = (sim.w * x).sum() / sim.w.sum()
        for _ in range(100):
            sim.step(1 / 120, contact, (12, 0))
        np.testing.assert_allclose(sim.totals(), initial, rtol=1e-12)
        np.testing.assert_allclose(sim.p, .7 * sim.w, atol=1e-12)
        self.assertGreater((sim.w * x).sum() / sim.w.sum(), centre_before)


if __name__ == '__main__':
    unittest.main()
