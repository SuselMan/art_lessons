"""CPU-only portable grouping/qualification tests; no private fixtures required."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
sys.dont_write_bytecode = True
from review_timing import apply_timing

OLD = 'wgsl-macro-coherent-safe-dither'
NEW = 'wgsl-macro-coherent-fast-initial'
H = 'ab' * 32
SHA = dict(rgba='r', water='w', paper='p')


def row(algorithm, warm, config=None):
    request = dict(algorithm=algorithm, fixture='mini-wave', config=config or dict(eddyCells=16), encoding='optical-density')
    result = dict(**request, fixtureSHA=SHA, hardware=dict(vendor='qualcomm'), repeatExact=True,
                  hashes=[H] * (len(warm) + 1), samples=[dict(totalReadyMs=v) for v in [9999] + warm])
    return dict(request=request, result=result, pass_=True) | {'pass': True}


def report(config=None):
    return dict(pass_=True, sourceStable=True, errors=[], cases=[
        row(OLD, [1, 2, 3], config), row(NEW, [2, 4], config),
        row(NEW, [8, 10, 12], config), row(OLD, [100], config)]) | {'pass': True}


def cards(r):
    return [dict(id='mini-wave', variants=[
        dict(id='old', timeMs=999, resultText='Перенос', note='Старое описание', evidence=copy.deepcopy(r['cases'][0]['result'])),
        dict(id='new', timeMs=999, resultText='Перенос', note='', evidence=copy.deepcopy(r['cases'][1]['result'])),
        dict(id='original', timeMs=700, note='Mini', evidence=dict(algorithm='native-mini'))])]


class TimingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def save(self, name, data):
        p = Path(self.tmp.name) / name
        p.write_text(json.dumps(data))
        return p

    def test_pools_raw_warms_not_arm_medians_and_only_new_gets_gain(self):
        r = report()
        scenes = cards(r)
        p = self.save('abba.json', r)
        self.assertIs(apply_timing(scenes, [p]), scenes)
        old, new, original = scenes[0]['variants']
        self.assertEqual(old['timeMs'], 2.5)  # NOT median([2,100])=51
        self.assertEqual(new['timeMs'], 8)  # NOT median([3,10])=6.5
        self.assertNotIn('gainText', old)
        self.assertIn('+220%', new['gainText'])
        self.assertFalse(new['comparable'])
        self.assertEqual(original['timeMs'], 700)
        self.assertNotIn('timing', original['evidence'])
        self.assertEqual(old['evidence']['timing']['arms'][OLD]['count'], 4)
        self.assertEqual(new['evidence']['timing']['arms'][NEW]['count'], 5)
        apply_timing(scenes, [p])
        self.assertEqual(new['resultText'].count('ABBA:'), 1)

    def test_idle_is_separate_does_not_change_tight_median(self):
        r = report()
        idle = dict(r, cases=[row(NEW, [200, 400])])
        idle['cases'][0]['request'].update(idleBetweenMs=5000, profileGPU=True)
        scenes = cards(r)
        apply_timing(scenes, [self.save('tight.json', r)], [self.save('idle.json', idle)])
        new = scenes[0]['variants'][1]
        self.assertEqual(new['timeMs'], 8)
        self.assertEqual(new['evidence']['idleTiming']['medianMs'], 300)
        self.assertEqual(new['evidence']['idleTiming']['minMs'], 200)
        self.assertNotIn('idleTiming', scenes[0]['variants'][0]['evidence'])

    def test_configuration_isolated_and_unmatched_output_unannotated(self):
        a, b = report(), report(dict(eddyCells=8))
        for c in b['cases']:
            c['result']['samples'] = [dict(totalReadyMs=999), dict(totalReadyMs=50)]
            c['result']['hashes'] = [H, H]
        scenes = cards(a) + cards(b)
        apply_timing(scenes, [self.save('a.json', a), self.save('b.json', b)])
        self.assertEqual(scenes[0]['variants'][0]['timeMs'], 2.5)
        self.assertEqual(scenes[1]['variants'][0]['timeMs'], 50)
        unmatched = cards(a)
        unmatched[0]['variants'][1]['evidence']['hashes'] = ['cd' * 32]
        apply_timing(unmatched, [self.save('a.json', a)])
        self.assertEqual(unmatched[0]['variants'][1]['timeMs'], 999)

    def test_invalid_exact_evidence_or_protocol_fails_closed(self):
        for fault in ['hash', 'input', 'repeat', 'report', 'abba', 'idle']:
            with self.subTest(fault=fault):
                r = report()
                if fault == 'hash':
                    r['cases'][1]['result']['hashes'] = ['cd' * 32] * 3
                if fault == 'input':
                    r['cases'][1]['result']['fixtureSHA'] = dict(SHA, water='different')
                if fault == 'repeat':
                    r['cases'][1]['result']['repeatExact'] = False
                if fault == 'report':
                    r['pass'] = False
                if fault == 'abba':
                    r['cases'] = r['cases'][:2]
                if fault == 'idle':
                    r['cases'][0]['request']['idleBetweenMs'] = 5000
                with self.assertRaises(ValueError):
                    apply_timing(cards(report()), [self.save('bad.json', r)])

    def test_cli(self):
        r = report()
        source = self.save('cards.json', dict(scenes=cards(r)))
        target = Path(self.tmp.name) / 'out.json'
        subprocess.run([sys.executable, str(Path(__file__).with_name('review_timing.py')), str(source), str(target),
                        '--report', str(self.save('abba.json', r))], check=True,
                       env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
        self.assertEqual(json.loads(target.read_text())['scenes'][0]['variants'][1]['timeMs'], 8)


if __name__ == '__main__':
    unittest.main()
