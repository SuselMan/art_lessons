import copy
import unittest
import tempfile
import pathlib
import hashlib
import json
from review_native_timing import apply_native_timings, validate_native_timing, CONTRACT, BOUNDARY, EXCLUDED, FULL_BOUNDARY, read_timing_bundle


class NativeTimingTest(unittest.TestCase):
    def setup_case(self, arm='original', times=(120, 100, 110)):
        key = 'original' if arm == 'original' else 'native-' + arm
        sha = {k: str(i)*64 for i, k in enumerate(('rgba', 'water', 'paper'), 1)}
        planes = {k: '4'*64 for k in ('p', 'c', 'coverage', 'solvent', 'foreign', 'original', 'paper')}
        inp = dict(id='s', sha=sha, encoding='optical-density', expectedDisplayDensityScale=.7, expectedInputBinarySHA256='5'*64)
        choice = dict(key=key, kind='native-mini', flags=dict(frontLazy=arm == 'lazy'))
        cell = dict(sceneId='s', comparisonKey=key, rawSHA='6'*64,
                    nativeProof=dict(contract='authored-native-replay-v1', componentIsolation=dict(originalPlaneSHA=planes, totalComponentCount=1)))
        report = dict(contract=CONTRACT, request=dict(fixture='s', arm=arm), pass_=True, repeatExact=True, sourceStable=True, contextClosed=True,
                      errors=[], inputSHA=sha, inputBinarySHA='5'*64, encoding=inp['encoding'], displayScale=.7,
                      proofCommonSHA='6'*64, commonCarrierSHA='6'*64, proofReportSHA='7'*64,
                      buildManifestSHA='8'*64, sourceHashes={'worker.js': '9'*64}, buildFlags={**choice['flags'],'nativeCapture':True,'gatherSpecialization':False},
                      regime=dict(repeats=3, idleRequestedMs=0, order='consecutive same owned engine; first sample retained; warm samples index1..2'),
                      outputRows='gl-bottom-up', expectedGLSHA='a'*64, hashes=['a'*64]*3,
                      mapping=dict(mode='authored'), lastEvidence=dict(sourceSHA=planes, sourceSHAAfter=planes, components=[dict(id=0)]),
                      samples=[dict(totalReadyMs=t, totalToFullReadbackMs=t*1.1, fullReadbackMs=t*.1, fullOutputBoundary=FULL_BOUNDARY, setupReadyMs=2, computeReadyMs=t-2, primaryBoundary=BOUNDARY, excluded=EXCLUDED, componentCount=1) for t in times])
        report['pass'] = report.pop('pass_')
        allowed = [dict(key=key, buildManifestSHA256='8'*64, sourceHashes=report['sourceHashes'], flags=choice['flags'], timingContract=CONTRACT)]
        return inp, choice, cell, report, allowed

    def test_total_median_not_proof_or_secondary_compute(self):
        inp, choice, cell, report, allowed = self.setup_case()
        result = validate_native_timing(report, cell, inp, choice, allowed)
        self.assertAlmostEqual(result['timeMs'], 115.5)
        self.assertFalse(result['crossWorkerComparable'])
        self.assertEqual(report['samples'][0]['totalReadyMs'], 120)

    def test_wrong_output_input_build_repeat_and_scope_rejected(self):
        for fault in ('output', 'input', 'build', 'repeat', 'scope', 'count', 'source', 'nan', 'onepixel'):
            inp, choice, cell, report, allowed = self.setup_case()
            if fault == 'output': report['commonCarrierSHA'] = '0'*64
            if fault == 'input': report['inputBinarySHA'] = '0'*64
            if fault == 'build': allowed = []
            if fault == 'repeat': report['hashes'].pop()
            if fault == 'scope': report['samples'][0]['excluded'] = 'proof included'
            if fault == 'count': report['samples'][0]['componentCount'] = 2
            if fault == 'source': report['lastEvidence']['sourceSHAAfter'] = {}
            if fault == 'onepixel': report['samples'][0].pop('totalToFullReadbackMs')
            if fault == 'nan': report['samples'][0]['totalReadyMs'] = float('nan')
            with self.subTest(fault=fault), self.assertRaises(ValueError):
                validate_native_timing(report, cell, inp, choice, allowed)

    def test_timing_build_bytes_verified_and_incomplete_file_is_pending(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            build = root / 'build'
            build.mkdir()
            files = []
            for name in ('entry.js','worker.js','index.html'):
                (build / name).write_text(name)
                files.append(dict(file=name,sha256=hashlib.sha256(name.encode()).hexdigest()))
            (build / 'manifest.json').write_text(json.dumps(dict(files=files,frontLazy=False,nativeCapture=True,gatherSpecialization=False)))
            reportdir = root / 'queue' / 's-original'
            reportdir.mkdir(parents=True)
            (reportdir / 'report.json').write_text('{')
            reports, allowed, status = read_timing_bundle(root/'queue', {'original':build}, {'choices':[dict(key='original',kind='native-mini',flags=dict(frontLazy=False))]})
            self.assertEqual(reports,[])
            self.assertEqual(len(allowed),1)
            self.assertTrue(status['pendingOrFailed'][0]['updatingReport'])
            (build / 'worker.js').write_text('changed')
            with self.assertRaises(ValueError):
                read_timing_bundle(root/'queue', {'original':build}, {'choices':[dict(key='original',kind='native-mini',flags=dict(frontLazy=False))]})

    def test_native_gain_only_same_scope_worker_and_unmeasured_unchanged(self):
        inp, original, a, ra, aa = self.setup_case()
        _, lazy, b, rb, ab = self.setup_case('lazy', (90, 80, 88))
        data = {'scenes': [dict(id='s', variants=[dict(comparisonKey='original'), dict(comparisonKey='native-lazy'), dict(comparisonKey='model:x', timeMs=12), dict(comparisonKey='native-cache', timeMs=999, evidence={'timingContract':'native-component-diagnostic-loop-v1'})])]}
        before = copy.deepcopy(data)
        result = apply_native_timings(data, [a, b], {'inputs':[inp]}, {'choices':[original,lazy]}, [ra,rb], aa+ab)
        variants = result['scenes'][0]['variants']
        self.assertAlmostEqual(variants[1]['nativeTimed']['changePercent'], -20)
        self.assertAlmostEqual(variants[1]['nativeTimed']['baselineMs'], 115.5)
        self.assertFalse(variants[1]['comparable'])
        self.assertEqual(variants[2:], before['scenes'][0]['variants'][2:])
        self.assertEqual(data, before)
        with self.assertRaises(ValueError):
            apply_native_timings(data, [a], {'inputs':[inp]}, {'choices':[original]}, [ra,ra], aa)


if __name__ == '__main__':
    unittest.main()
