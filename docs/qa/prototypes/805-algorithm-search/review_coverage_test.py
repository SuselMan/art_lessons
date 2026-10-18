import unittest
from review_coverage import annotate_resolution, coverage_plan

class CoverageTest(unittest.TestCase):
    def data(self):
        return {'scenes': [{'id':'mini-wave','variants':[{'id':'original','label':'Исходный','image':'original.png'}, {'id':'input','label':'Вход','image':'input.png'}]}]}
    def test_measured_only_not_registry_presets(self):
        measured={'cases':[{'request':{'algorithm':'search-artistic-program','config':{'programRim':0},'fixture':'old'},'result':{'samples':[{}], 'fixtureSHA':{'rgba':'a'}}}]}
        p=coverage_plan(self.data(),{'definitions':[{'id':'unused','backend':'webgpu','configs':[{}]}],'sourceSHA256':'a','sourceFiles':1},measured_programs=measured)
        self.assertEqual(p['summary']['additionalMeasuredProgramChoices'],1)
        self.assertEqual(p['summary']['workerChoices'],1)
        self.assertTrue(p['choices'][-1]['expectedOnly'])
        self.assertEqual(len(p['matrix'][0]['historicalMissingKeys']),1)
    def test_no_fake_grid_and_stride_not_resolution(self):
        d={'scenes':[{'variants':[{'evidence':{'algorithm':'alternative-finite-volume-exchange','config':{'coarse':8},'metadata':{'resolution':1024}}},{'evidence':{}},{'evidence':{'metadata':{'grid':128,'fineModel':'fine','fineSteps':0},'captureManifest':{'size':1024}}}]}]}
        v=annotate_resolution(d)['scenes'][0]['variants']
        self.assertEqual(v[0]['gridResolution']['transportGrid'],256)
        self.assertTrue(v[1]['gridResolution']['unknown'])
        self.assertEqual(v[2]['gridResolution']['localFineGrid'],1024)
        self.assertEqual(v[2]['gridResolution']['fineSteps'],0)

    def test_actual_stage_resolution_preserves_evidence(self):
        import copy
        variants = [
            {'evidence': {'algorithm':'alternative-stable-fluids','metadata': {'resolution':256},'captureManifest': {'size':1024}}},
            {'evidence': {'algorithm':'macro2-dense-wetpath-exchange','metadata': {'resolution':1024},'captureManifest': {'size':1024}}},
            {'evidence': {'algorithm':'wgsl-macro-implicit-fine-paper','metadata': {'grid':256,'fineSteps':8},'captureManifest': {'size':1024}}}]
        before = copy.deepcopy(variants)
        result = annotate_resolution({'scenes':[{'variants':variants}]})['scenes'][0]['variants']
        self.assertEqual([v['gridResolution']['transportGrid'] for v in result], [256,256,256])
        self.assertEqual(result[2]['gridResolution']['localFineGrid'],1024)
        self.assertEqual([v['evidence'] for v in result], [v['evidence'] for v in before])

if __name__=='__main__': unittest.main()
