import copy
import hashlib
import unittest
from review_fixed_matrix import assemble_fixed_matrix, worker_cell_from_batch, MatrixError


class MatrixTest(unittest.TestCase):
    def setUp(self):
        self.sha = {k: c * 64 for k, c in zip(('rgba', 'water', 'paper'), ('a', 'b', 'c'))}
        self.choice = {'key': 'model:x', 'kind': 'worker-factory', 'algorithm': 'x', 'config': {'steps': 4}, 'label': 'X'}
        self.shell = {'scenes': [{'id': 's', 'variants': [{'id': 'old', 'image': 'historic.png'}]}]}
        self.plan = {'choices': [self.choice], 'matrix': [{'scene': 's'}]}
        self.manifest = {'choices': [self.choice], 'inputs': [{'id': 's', 'sha': self.sha, 'encoding': 'optical-density'}], 'registrySHA': 'e' * 64}
        self.cell = {'sceneId': 's', 'comparisonKey': 'model:x',
                     'sourceHashes': {'worker': 'd' * 64}, 'rawSHA': 'f' * 64,
                     'pngSHA': hashlib.sha256(b'png').hexdigest(),
                     'variant': {'id': 'fresh', 'imageSource': 'fresh.png', 'image': 'stale.png'},
                     'request': {'algorithm': 'x', 'config': {'steps': 4}, 'fixedInitialWet': True, 'encoding': 'optical-density'},
                     'result': {'pass': True, 'algorithm': 'x', 'config': {'steps': 4}, 'encoding': 'optical-density',
                                'fixtureSHA': self.sha, 'fixtureSHAAfter': self.sha, 'inputUnchanged': True,
                                'repeatExact': True, 'requestedDomainPolicy': 'initial-fixed-v1',
                                'initialWetAudit': {'policy': 'initial-raw-water-positive-v1', 'threshold': 0,
                                                    'dryIdentity': True, 'changedDryChannels': 0, 'newPigmentDryPixels': 0}},
                     'rawAudit': {'pass': True, 'rawSHA': 'f' * 64, 'inputSHA': self.sha, 'sourceHashes': {'worker': 'd' * 64}},
                     'commonRenderer': {'inputSHA': self.sha, 'inputDerivedScale': True, 'outputNormalized': False}}

    def run_cells(self, cells):
        return assemble_fixed_matrix(self.shell, self.plan, self.manifest, cells, lambda _: b'png')

    def test_complete_replaces_historical_preserves_key_without_mutation(self):
        original = copy.deepcopy(self.shell)
        out = self.run_cells([self.cell])
        self.assertEqual(self.shell, original)
        self.assertTrue(out['fixedMatrixCoverage']['complete'])
        self.assertEqual(out['variantCatalog'], [{'key': 'model:x', 'label': 'X'}])
        self.assertEqual(out['scenes'][0]['variants'][0]['id'], 'fresh')
        self.assertNotIn('image', out['scenes'][0]['variants'][0])

    def test_missing_and_duplicate_rejected(self):
        for cells in ([], [self.cell, self.cell]):
            with self.assertRaises(MatrixError):
                self.run_cells(cells)
        self.plan['choices'].append(self.choice)
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])

    def test_old_policy_and_wrong_input_and_raw_audit_rejected(self):
        for change in ('old', 'sha', 'audit', 'normalized', 'png'):
            c = copy.deepcopy(self.cell)
            if change == 'old':
                c['request']['fixedInitialWet'] = False
            elif change == 'sha':
                c['result']['fixtureSHA']['water'] = '0' * 64
            elif change == 'audit':
                c['rawAudit']['sourceHashes'] = {'worker': '1' * 64}
            elif change == 'normalized':
                c['commonRenderer']['outputNormalized'] = True
            else:
                c['pngSHA'] = '0' * 64
            with self.subTest(change=change), self.assertRaises(MatrixError):
                self.run_cells([c])

    def test_batch_adapter_requires_whole_report_and_fixed_row_proof(self):
        report = dict(pass_=True, sourceStable=True, contextClosed=True, errors=[],
                      sourceHashes=self.cell['sourceHashes'])
        report['pass'] = report.pop('pass_')
        row = {'pass': True, 'fixedInitialWetVerified': True, 'sameFixtureInput': True,
               'request': self.cell['request'], 'result': self.cell['result'],
               'png': {'sha256': self.cell['pngSHA']}, 'carrier': {'decodedSHA256': self.cell['rawSHA']}}
        def normalize():
            return worker_cell_from_batch(report, row, scene_id='s', comparison_key='model:x',
                                          variant=self.cell['variant'], raw_audit=self.cell['rawAudit'],
                                          common_renderer=self.cell['commonRenderer'])
        self.assertTrue(self.run_cells([normalize()])['fixedMatrixCoverage']['complete'])
        report['sourceStable'] = False
        with self.assertRaises(MatrixError):
            normalize()
        report['sourceStable'] = True
        row['fixedInitialWetVerified'] = False
        with self.assertRaises(MatrixError):
            normalize()

    def test_native_requires_per_input_proof_not_authored_id(self):
        self.choice.update(key='original', kind='native-mini', flags={'frontZero': True})
        self.cell['comparisonKey'] = 'original'
        self.cell['request']['flags'] = {'frontZero': True}
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        self.cell['nativeProof'] = dict(contract='common-optical-seed-v1', inputSHA=self.sha,
                                       rawPlanesExact=True, paperExact=True, sourceUnchanged=True,
                                       fixedInitialWet=True, roundtripExact=True)
        self.assertTrue(self.run_cells([self.cell])['fixedMatrixCoverage']['complete'])
        self.cell['nativeProof']['contract'] = 'authored-native-replay-v1'
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        self.cell['nativeProof'].update(authoredReplayExact=True, capturedRawExact=True,
                                       nativeCompositeActual=True, originalBaselinePreserved=True,
                                       replaySHA='1' * 64, nativeRawSHA='2' * 64,
                                       capturedCommonSHA=self.sha,
                                       rawDryAudit={'pass': True, 'changedDryChannels': 0,
                                                    'inputSHA': self.sha, 'rawSHA': self.cell['rawSHA'],
                                                    'sourceHashes': self.cell['sourceHashes']})
        self.assertTrue(self.run_cells([self.cell])['fixedMatrixCoverage']['complete'])


if __name__ == '__main__':
    unittest.main()
