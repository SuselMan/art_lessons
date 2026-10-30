"""Closed provider boundaries and independent original-ARM coefficient gates."""
import copy
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import native_curve_arm_v3 as api
from build_native_curve_arm_v3 import _apply_patch, _patches

HERE = Path(__file__).resolve().parent
GOOD = [[[0., 0., False], [1., 1., False]]]
BUILD = 'a' * 64
PROVIDER = api.MappedCurveProvider('/explicit/compiler', BUILD)
DESCRIPTION = {'profile': api.PROFILE, 'buildId': BUILD, 'input': dict(api.INPUT)}
RESULT = {'profile': api.PROFILE, 'buildId': BUILD, 'curves': [[[0., 0., 1., 0.]]]}


def raw(value):
    return json.dumps(value).encode('ascii')


class MappedBoundaryTests(unittest.TestCase):
    def test_invalid_grammar_and_untrusted_provider_never_execute(self):
        invalid = [[], [GOOD[0]] * 65, [[[0, 0, True], [1, 1, False]]],
                   [[[0, 0, False], [1, 1, True]]], [[[0, 0, False], [0, 1, False]]],
                   [[[i / 9, .5, False] for i in range(10)]], [[[0, float('nan'), False], [1, 1, False]]]]
        with patch.object(api, '_run') as run:
            for value in invalid:
                with self.subTest(value=value), self.assertRaises(ValueError):
                    api.compile_curves_arm_v3(value, PROVIDER)
            with self.assertRaises(ValueError):
                api.compile_curves_arm_v3(GOOD, '/explicit/compiler')
            run.assert_not_called()
        for executable, build in [('relative', BUILD), ('/compiler', 'bad'), ('/compiler', 'A' * 64)]:
            with self.assertRaises(ValueError): api.MappedCurveProvider(executable, build)

    def test_closed_description_is_required_before_batch(self):
        bad = [{**DESCRIPTION, 'extra': 1}, {**DESCRIPTION, 'buildId': 'b' * 64},
               {**DESCRIPTION, 'profile': 'old'}, {**DESCRIPTION, 'input': {**dict(api.INPUT), 'maximumKnots': 9.0}}]
        for description in bad:
            with patch.object(api, '_run', return_value=raw(description)) as run:
                with self.assertRaises(ValueError): api.compile_curves_arm_v3(GOOD, PROVIDER)
                self.assertEqual(run.call_count, 1)

    def test_closed_batch_and_nonfinite_values_reject_without_fallback(self):
        bad = [b'{', b'{"profile":1,"profile":2}', raw({**RESULT, 'extra': 1}),
               raw({**RESULT, 'buildId': 'b' * 64}), raw({**RESULT, 'curves': []}),
               raw({**RESULT, 'curves': [[[0, 0, True, 0]]]}),
               raw({**RESULT, 'curves': [[[0, 0, float('inf'), 0]]]}),
               raw({**RESULT, 'curves': [[[0, 0, 1e309, 0]]]})]
        for response in bad:
            with patch.object(api, '_run', side_effect=[raw(DESCRIPTION), response]) as run:
                with self.assertRaises(ValueError): api.compile_curves_arm_v3(GOOD, PROVIDER)
                self.assertEqual(run.call_count, 2)

    def test_signed_zero_and_input_immutability(self):
        inputs = copy.deepcopy(GOOD)
        response = raw(RESULT).replace(b'0.0', b'-0', 1)
        with patch.object(api, '_run', side_effect=[raw(DESCRIPTION), response]):
            result = api.compile_curves_arm_v3(inputs, PROVIDER)
        self.assertEqual(struct.pack('>d', result[0][0][0]), bytes.fromhex('8000000000000000'))
        self.assertEqual(inputs, GOOD)

    def test_owned_child_output_and_timeout_are_bounded(self):
        with tempfile.TemporaryDirectory(prefix='curve-provider-boundary-') as directory:
            script = Path(directory) / 'child.py'
            for code, timeout, budget in [('import time;time.sleep(10)', .05, 64),
                                          ('print("x"*1024)', 2, 64),
                                          ('import sys;sys.stderr.write("bad");sys.exit(2)', 2, 64)]:
                script.write_text(code)
                with self.assertRaises(ValueError):
                    api._run(sys.executable, [str(script)], b'', timeout=timeout, maximum_output=budget)

    def test_patch_parser_requires_exact_context_and_closed_paths(self):
        patch_lines = ['@@ -1,2 +1,2 @@\n', ' a\n', '-b\n', '+c\n']
        self.assertEqual(_apply_patch('a\nb\n', patch_lines), 'a\nc\n')
        with self.assertRaises(ValueError): _apply_patch('a\nB\n', patch_lines)
        with self.assertRaises(ValueError): _patches('--- a/../bad\n+++ b/../bad\n@@ -1 +1 @@\n-a\n+b\n')


EXECUTABLE = os.environ.get('GRAFETTO_MAPPED_CURVE_COMPILER')
BUILD_ID = os.environ.get('GRAFETTO_MAPPED_CURVE_BUILD_ID')


@unittest.skipUnless(EXECUTABLE and BUILD_ID, 'set explicit mapped compiler and trusted build ID')
class MappedNativeTests(unittest.TestCase):
    def setUp(self):
        self.provider = api.MappedCurveProvider(EXECUTABLE, BUILD_ID)

    def test_original_79_constructors_exact_or_explicit_branch_reject(self):
        fixture = json.loads((HERE / 'fixtures/curve_arm_v3.native.json').read_text())
        accepted = rejected = coefficients = 0
        for case in fixture['cases']:
            points = [[p['x'], p['y'], p['corner']] for p in case['points']]
            with self.subTest(case=case['id']):
                if not case['supported']:
                    with self.assertRaisesRegex(ValueError, '^unsupported-source-branch:' + case['unsupportedBranch'] + '$'):
                        api.compile_curves_arm_v3([points], self.provider)
                    rejected += 1
                else:
                    actual = api.compile_curves_arm_v3([points], self.provider)[0]
                    self.assertEqual([[struct.pack('>d', v) for v in p] for p in actual],
                                     [[struct.pack('>d', v) for v in p] for p in case['coefficients']])
                    accepted += 1
                    coefficients += len(actual) * 4
        self.assertEqual((accepted, rejected, coefficients), (66, 13, 636))

    def test_actual_five_radial_constructors_match_original_coefficients(self):
        path = HERE.parents[1] / 'apps/web/src/engine/src/presets/fixtures/sourceSoftCircle/tables.native.json'
        fixture = json.loads(path.read_text())
        cases = fixture['constructors']
        points = [[[p['x'], p['y'], p['corner']] for p in case['points']] for case in cases]
        actual = api.compile_curves_arm_v3(points, self.provider)
        expected = [case['coefficients'] for case in cases]
        bits = lambda curves: [[[struct.pack('>d', v) for v in piece] for piece in curve] for curve in curves]
        self.assertEqual(bits(actual), bits(expected))
        self.assertEqual(sum(len(curve) * 4 for curve in actual), 44)

    def test_late_overflow_and_unsupported_batch_have_no_partial_stdout(self):
        # Finite legal knots, but tiny dx overflows the two-point slope. The old
        # provider contract stays unchanged; the new response must be atomic.
        payload = '2\n2\n0 0 0\n1 1 0\n2\n2.2250738585072014e-308 0 0\n2.225073858507202e-308 1 0\n'
        # Both x values are normal and accepted by iostream; their positive
        # difference is a subnormal, so finite y/dx overflows during compilation.
        result = subprocess.run([EXECUTABLE], input=payload, text=True, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')
        self.assertEqual(result.stderr.strip(), 'Nonfinite compiled coefficient')
        fixture = json.loads((HERE / 'fixtures/curve_arm_v3.native.json').read_text())
        blocked = next(c for c in fixture['cases'] if not c['supported'])
        points = [[p['x'], p['y'], p['corner']] for p in blocked['points']]
        from native_curve_compile import _input
        result = subprocess.run([EXECUTABLE], input=_input([GOOD[0], points]), text=True, capture_output=True, timeout=5)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
