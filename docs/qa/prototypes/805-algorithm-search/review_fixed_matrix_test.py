import copy
import hashlib
import unittest
import json
import tempfile
from pathlib import Path
from review_fixed_matrix import assemble_fixed_matrix, worker_cell_from_batch, coverage_report, catalog_identity_sha, main, MatrixError


class MatrixTest(unittest.TestCase):
    def setUp(self):
        self.sha = {k: c * 64 for k, c in zip(('rgba', 'water', 'paper'), ('a', 'b', 'c'))}
        self.choice = {'key': 'model:x', 'kind': 'worker-factory', 'algorithm': 'x', 'config': {'steps': 4}, 'label': 'X'}
        self.shell = {'scenes': [{'id': 's', 'variants': [{'id': 'old', 'image': 'historic.png'}]}]}
        self.plan = {'choices': [self.choice], 'matrix': [{'scene': 's'}]}
        self.manifest = {'choices': [self.choice], 'inputs': [{'id': 's', 'sha': self.sha, 'encoding': 'optical-density', 'expectedDisplayDensityScale': 1}], 'registrySHA': 'e' * 64}
        self.manifest['allowedBuilds'] = {'model:x': [{'buildManifestSHA256': '7' * 64, 'sourceHashes': {'worker': 'd' * 64}, 'policy': 'initial-fixed-v1'}]}
        self.cell = {'buildManifestSHA256': '7' * 64, 'sceneId': 's', 'comparisonKey': 'model:x',
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
                     'commonRenderer': {'inputSHA': self.sha, 'inputDerivedScale': True, 'outputNormalized': False, 'displayDensityScale': 1, 'paperSHA': self.sha['paper']}}

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
        for change in ('old', 'sha', 'audit', 'normalized', 'scale', 'paper', 'png'):
            c = copy.deepcopy(self.cell)
            if change == 'old':
                c['request']['fixedInitialWet'] = False
            elif change == 'sha':
                c['result']['fixtureSHA']['water'] = '0' * 64
            elif change == 'audit':
                c['rawAudit']['sourceHashes'] = {'worker': '1' * 64}
            elif change == 'normalized':
                c['commonRenderer']['outputNormalized'] = True
            elif change == 'scale':
                c['commonRenderer']['displayDensityScale'] = .5
            elif change == 'paper':
                c['commonRenderer']['paperSHA'] = '0' * 64
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
                                          common_renderer=self.cell['commonRenderer'], build_manifest_sha='7' * 64)
        self.assertTrue(self.run_cells([normalize()])['fixedMatrixCoverage']['complete'])
        report['sourceStable'] = False
        with self.assertRaises(MatrixError):
            normalize()
        report['sourceStable'] = True
        row['fixedInitialWetVerified'] = False
        with self.assertRaises(MatrixError):
            normalize()

    def test_partial_batch_closure_preserves_failure_and_binds_exact_successful_row(self):
        row = {'pass': True, 'fixedInitialWetVerified': True, 'sameFixtureInput': True,
               'request': self.cell['request'], 'result': self.cell['result'],
               'png': {'sha256': self.cell['pngSHA']}, 'carrier': {'decodedSHA256': self.cell['rawSHA']}}
        report = {'pass': False, 'failure': 'budget exceeded', 'contextClosed': True, 'errors': [],
                  'sourceHashes': self.cell['sourceHashes'], 'cases': [row, {'pass': False}]}
        closure = dict(reportSHA256='8' * 64, buildManifestSHA256='7' * 64,
                       sourceHashesBefore=self.cell['sourceHashes'], sourceHashesAfter=self.cell['sourceHashes'],
                       verifiedReadBuild=True, sourceStable=True, contextClosed=True, errors=[], excludedFailedRows=[1])
        def normalize():
            return worker_cell_from_batch(report, row, scene_id='s', comparison_key='model:x',
                variant=self.cell['variant'], raw_audit=self.cell['rawAudit'], common_renderer=self.cell['commonRenderer'],
                build_manifest_sha='7' * 64, closure=closure, report_sha='8' * 64, closure_sha='9' * 64, row_index=0)
        out = normalize()
        self.assertTrue(self.run_cells([out])['fixedMatrixCoverage']['complete'])
        self.assertFalse(out['variant']['evidence']['batchScope']['reportPass'])
        self.assertFalse(report['pass'])
        for change in ('reportSHA256', 'sourceHashesAfter', 'excludedFailedRows'):
            old = closure[change]
            closure[change] = 'wrong'
            with self.subTest(change=change), self.assertRaises(MatrixError):normalize()
            closure[change] = old

    def test_choice_build_allowlist_rejects_unknown_build_or_other_source(self):
        good = copy.deepcopy(self.cell)
        for change in ('build', 'source', 'policy'):
            self.cell = copy.deepcopy(good)
            if change == 'build':
                self.cell['buildManifestSHA256'] = '8' * 64
            elif change == 'source':
                self.cell['sourceHashes'] = {'worker': '9' * 64}
            else:
                self.manifest['allowedBuilds']['model:x'][0]['policy'] = 'old-policy'
            with self.subTest(change=change), self.assertRaises(MatrixError):
                self.run_cells([self.cell])

    def test_coverage_reports_invalid_missing_and_duplicates_without_completeness(self):
        self.plan['registrySourceSHA256'] = self.manifest['registrySHA']
        report = coverage_report(self.shell, self.plan, self.manifest, [self.cell, self.cell], lambda _: b'png')
        self.assertFalse(report['complete'])
        self.assertEqual(report['duplicates'][0]['count'], 2)
        report = coverage_report(self.shell, self.plan, self.manifest, [], lambda _: b'png')
        self.assertEqual(len(report['missing']), 1)

    def test_cli_exact_references_and_no_output_on_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'fresh.png').write_bytes(b'png')
            self.cell['variant']['imageSource'] = str(root / 'fresh.png')
            reference = copy.deepcopy(self.cell)
            reference.update(comparisonKey='input', inputReferenceExact=True, rawSHA=self.sha['rgba'])
            reference['rawAudit']['rawSHA'] = self.sha['rgba']
            ref_choice = {'key': 'input', 'kind': 'input-reference', 'label': 'Вход'}
            self.plan['choices'].append(ref_choice)
            self.manifest['choices'].append(ref_choice)
            self.plan['registrySourceSHA256'] = self.manifest['registrySHA']
            args = []
            for name, value in [('shell', self.shell), ('plan', self.plan), ('manifest', self.manifest),
                                ('cells', [self.cell]), ('references', [reference]), ('component-counts', [{'id': 's', 'components': 1, 'pigmented': 1, 'inputSHA': self.sha}])]:
                file = root / (name + '.json')
                file.write_text(json.dumps(value))
                args += ['--' + name, str(file)]
            metadata = root / 'metadata.json'
            metadata.write_text(json.dumps({'source': {'kind': 'deterministic-fixture'}, 'sha': self.sha}))
            catalog = root / 'catalog.json'
            catalog.write_text(json.dumps([{'id': 's', 'sha': self.sha, 'encoding': 'optical-density',
                                            'metadata': str(metadata),
                                            'metadataSHA256': hashlib.sha256(metadata.read_bytes()).hexdigest()}]))
            allowed = root / 'allowed.json'
            allowed.write_text(json.dumps({'catalogSHA256': catalog_identity_sha(self.plan),
                'choices': [{'key': 'model:x', 'builds': self.manifest['allowedBuilds']['model:x']}]}))
            args += ['--input-catalog', str(catalog), '--allowed-builds', str(allowed)]
            args += ['--coverage-report', str(root / 'coverage.json'), '--output', str(root / 'assembled.json')]
            self.assertEqual(main(args), 0)
            saved = (root / 'assembled.json').read_bytes()
            (root / 'cells.json').write_text('[]')
            self.assertEqual(main(args), 2)
            self.assertEqual((root / 'assembled.json').read_bytes(), saved)

    def test_native_requires_per_input_proof_not_authored_id(self):
        self.choice.update(key='original', kind='native-mini', flags={'frontZero': True})
        self.cell['comparisonKey'] = 'original'
        self.manifest['allowedBuilds']['original'] = [{'buildManifestSHA256': '7' * 64, 'sourceHashes': self.cell['sourceHashes'], 'policy': 'native-component-isolated-v1'}]
        self.cell['request']['flags'] = {'frontZero': True}
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        self.cell['nativeProof'] = dict(contract='common-optical-seed-v1', inputSHA=self.sha,
                                       rawPlanesExact=True, paperExact=True, sourceUnchanged=True,
                                       fixedInitialWet=True, roundtripExact=True)
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        self.manifest['inputs'][0]['nativeComponentCounts'] = {'components': 1, 'pigmented': 1}
        planes = {k: '3' * 64 for k in ('p', 'c', 'coverage', 'solvent', 'foreign', 'original', 'paper')}
        planes['paper'] = '5' * 64
        component = dict(id=0, pigmented=True, inputMaskSHA='4' * 64, expectedMaskedPlaneSHA=planes,
                         actualMaskedPlaneSHA=planes,
                         insideOriginalChangedChannels={k: 0 for k in planes},
                         outsideNonzeroChannels={k: 0 for k in ('p', 'c', 'coverage', 'solvent', 'foreign')},
                         backdropGlobalSHA={k: planes[k] for k in ('original', 'paper')},
                         paperExpectedSHA='5' * 64, paperActualSHA='5' * 64,
                         endpointSHA='6' * 64, outsideEndpointChangedChannels=0,
                         rawDryChangedChannels=0, runCount=1)
        self.cell['nativeProof']['componentIsolation'] = dict(policy='native-component-isolated-v1',
            inputSHA=self.sha, sourceHashes=self.cell['sourceHashes'], connectivity=4, threshold=0,
            totalComponentCount=1, pigmentedComponentCount=1, goalRuns=1, waterOnlyRuns=0,
            originalPlaneSHA=planes, paperSHA='5' * 64, components=[component])
        self.assertTrue(self.run_cells([self.cell])['fixedMatrixCoverage']['complete'])
        component['outsideEndpointChangedChannels'] = 1
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        component['outsideEndpointChangedChannels'] = 0
        component['pigmented'] = False
        self.manifest['inputs'][0]['nativeComponentCounts']['pigmented'] = 0
        isolation = self.cell['nativeProof']['componentIsolation']
        isolation.update(pigmentedComponentCount=0, waterOnlyRuns=1)
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        component['zeroCOutputNonzero'] = 0
        self.assertTrue(self.run_cells([self.cell])['fixedMatrixCoverage']['complete'])
        component['pigmented'] = True
        self.manifest['inputs'][0]['nativeComponentCounts']['pigmented'] = 1
        isolation.update(pigmentedComponentCount=1, waterOnlyRuns=0)
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
        with self.assertRaises(MatrixError):
            self.run_cells([self.cell])
        self.manifest['inputs'][0]['authoredNativeSource'] = dict(
            inputSHA=self.sha, originalPlaneSHA=planes, paperSHA='5' * 64,
            replaySHA='1' * 64, nativeRawSHA='2' * 64, nativeComponentCounts={'components': 1, 'pigmented': 1})
        self.assertTrue(self.run_cells([self.cell])['fixedMatrixCoverage']['complete'])


if __name__ == '__main__':
    unittest.main()
