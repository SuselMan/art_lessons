import json
import os
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch
from native_curve_compile import compile_curves

ROOT = Path(__file__).resolve().parents[2]
EXECUTABLE = os.environ.get('GRAFETTO_NATIVE_CURVE_COMPILER')
GOOD = [[[0., 0., False], [1., 1., False]]]


class NativeCurveBoundaryTests(unittest.TestCase):
    def test_malformed_inputs_are_rejected_before_executable_runs(self):
        invalid = [[], [GOOD[0]] * 65, [[[]]], [[[0, 0, False], [0, 1, False]]],
                   [[[0, 0, 1]]], [[[True, 0, False]]], [[[10**1000, 0, False]]], [[[0, float('nan'), False]]],
                   [[[0, 0, False], [2, 1, False]]], [[[(i / 256), .5, False] for i in range(257)]],
                   [[[(i / 255), .5, False] for i in range(256)]] * 17]
        with patch('native_curve_compile.subprocess.run') as run:
            for curves in invalid:
                with self.subTest(curves=str(curves)[:60]), self.assertRaises(ValueError):
                    compile_curves(curves, '/explicit/compiler')
            run.assert_not_called()

    def test_absolute_explicit_provider_is_required(self):
        with patch('native_curve_compile.subprocess.run') as run:
            for path in ['compiler', None, '']:
                with self.assertRaises(ValueError): compile_curves(GOOD, path)
            run.assert_not_called()

    def test_bad_provider_results_and_process_failures_do_not_fallback(self):
        outputs = ['[]', '[[[0,0,1]]]', '[[[0,0,true,0]]]', '[[[0,0,1,NaN]]]', '{}', 'not-json']
        for output in outputs:
            with patch('native_curve_compile.subprocess.run', return_value=subprocess.CompletedProcess([], 0, output, '')):
                with self.assertRaises(ValueError): compile_curves(GOOD, '/explicit/compiler')
        for error in [FileNotFoundError(), subprocess.TimeoutExpired('compiler', 15), subprocess.CalledProcessError(2, 'compiler')]:
            with patch('native_curve_compile.subprocess.run', side_effect=error):
                with self.assertRaises(ValueError): compile_curves(GOOD, '/explicit/compiler')


@unittest.skipUnless(EXECUTABLE, 'set explicit GRAFETTO_NATIVE_CURVE_COMPILER for native source tests')
class NativeCurveCompilerTests(unittest.TestCase):
    def test_matches_32_actual_stock_native_sparselu_coefficient_sets(self):
        fixture = json.loads((ROOT / 'apps/web/src/engine/src/presets/fixtures/sourceCurves.native.json').read_text())
        points = [c['points'] for c in fixture['curves']]
        self.assertEqual(compile_curves(points, EXECUTABLE), [c['coefficients'] for c in fixture['curves']])

    def test_matches_independent_unchanged_native_template_for_arbitrary_corner_and_256_knot_curves(self):
        fixture = json.loads((Path(__file__).parent / 'fixtures/source_curve_arbitrary.native.json').read_text())
        before = json.dumps(fixture['inputs'])
        self.assertEqual(compile_curves(fixture['inputs'], EXECUTABLE), fixture['coefficients'])
        self.assertEqual(json.dumps(fixture['inputs']), before)

    def test_native_cli_rejects_trailing_or_malformed_protocol_without_partial_json(self):
        for payload in ['0\n', '65\n', '1\n257\n', '1\n2\n0 0 0\n0 1 0\n', '1\n1\n0 0 0\ntrailing\n']:
            p = subprocess.run([EXECUTABLE], input=payload, capture_output=True, text=True, check=False)
            self.assertEqual(p.returncode, 2)
            self.assertEqual(p.stdout, '')


if __name__ == '__main__': unittest.main()
