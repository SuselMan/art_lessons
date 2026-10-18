import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from review_earlier import merge_earlier


class Earlier(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.images = self.root / 'images'
        self.images.mkdir()
        self.png = b'\x89PNG\r\n\x1a\noriginal'
        (self.images / 'original.png').write_bytes(self.png)
        (self.images / 'alt.png').write_bytes(b'\x89PNG\r\n\x1a\nalternative')
        self.current = self.root / 'current.png'
        self.current.write_bytes(self.png)
        sha = {'rgba': 'a'*64, 'water': 'b'*64, 'paper': 'c'*64}
        self.scenes = [dict(id='scene', commonInputSHA=sha, variants=[dict(id='original', imageSource=str(self.current))])]
        self.variants = [dict(id='original', image='images/original.png'),
                         dict(id='lazy', image='images/original.png', timeMs=123, baselineMs=120, gainText='на 2% медленнее', comparable=True,
                              evidence={'model': 'front8-detail-flow-v4', 'samples': [1, 2]}, note='qualified'),
                         dict(id='one-octave', image='images/alt.png', timeMs=99, comparable=True),
                         dict(id='lbm', image='images/alt.png', comparable=False,
                              evidence={'algorithm': 'lbm', 'config': {'steps': 16}, 'encoding': 'optical-density'})]
        self.old = dict(scenes=[dict(id='scene', commonInputSHA=copy.deepcopy(sha), variants=self.variants)])
        self.file = self.root / 'comparison.json'

    def merge(self):
        self.file.write_text(json.dumps(self.old))
        return merge_earlier(self.scenes, self.file, self.images)

    def test_preserves_models_same_pixels_evidence_timing_and_stable_native_family(self):
        self.merge()
        cards = self.scenes[0]['variants']
        self.assertEqual(len(cards), 4)
        lazy = cards[1]
        self.assertEqual(lazy['id'], 'earlier-native-lazy')
        self.assertEqual(lazy['family'], 'native')
        self.assertEqual(lazy['timeMs'], 123)
        self.assertTrue(lazy['comparable'])
        self.assertTrue(lazy['earlierComparison'])
        self.assertEqual(lazy['timingMode'], 'в серии')
        self.assertEqual(lazy['baselineMs'], 120)
        self.assertEqual(lazy['gainText'], 'на 2% медленнее')
        self.assertEqual(lazy['evidence'], self.variants[1]['evidence'])
        self.assertEqual(lazy['note'], 'qualified')
        self.assertEqual(lazy['imageSource'], str(self.images / 'original.png'))
        self.assertEqual(lazy['imageSHA256'], hashlib.sha256(self.png).hexdigest())
        self.assertFalse(cards[-1]['comparable'])
        self.merge()
        self.assertEqual(len(cards), 4, 'idempotent by model/config/encoding/full bytes')

    def test_dedup_requires_all_four_identity_parts(self):
        original = self.variants[-1]
        self.variants.extend([copy.deepcopy(original),
                              {**copy.deepcopy(original), 'evidence': {**original['evidence'], 'config': {'steps': 32}}},
                              {**copy.deepcopy(original), 'evidence': {**original['evidence'], 'encoding': 'rgb-proxy'}},
                              {**copy.deepcopy(original), 'image': 'images/original.png'}])
        self.merge()
        self.assertEqual(len(self.scenes[0]['variants']), 7)
        self.assertEqual(len({v['id'] for v in self.scenes[0]['variants']}), 7)

    def test_input_original_file_and_declared_sha_mismatch_fail_atomically(self):
        for change in ['input', 'id', 'original', 'declared', 'missing', 'path']:
            with self.subTest(change=change):
                saved = copy.deepcopy(self.old)
                before = copy.deepcopy(self.scenes)
                if change == 'input': self.old['scenes'][0]['commonInputSHA']['water'] = 'd'*64
                if change == 'id': self.old['scenes'][0]['id'] = 'other'
                if change == 'original': self.current.write_bytes(b'different')
                if change == 'declared': self.variants[1]['imageSHA256'] = '0'*64
                if change == 'missing': self.variants[1]['image'] = 'images/absent.png'
                if change == 'path': self.variants[1]['image'] = '../current.png'
                with self.assertRaises(ValueError): self.merge()
                self.assertEqual(self.scenes, before)
                self.old = saved
                self.variants = self.old['scenes'][0]['variants']
                self.current.write_bytes(self.png)

    def test_missing_common_sha_and_original_source_cannot_be_inferred(self):
        for field in ['commonInputSHA', 'imageSource']:
            before = copy.deepcopy(self.scenes)
            if field == 'commonInputSHA': del self.scenes[0][field]
            else: del self.scenes[0]['variants'][0][field]
            with self.assertRaises(ValueError): self.merge()
            self.scenes = before


if __name__ == '__main__':
    unittest.main()
