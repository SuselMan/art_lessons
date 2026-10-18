import copy
import json
import unittest
from review_ui_payload import compact_ui_payload


class PayloadTest(unittest.TestCase):
    def test_identity_selection_hold_and_timing_preserved_without_source_mutation(self):
        data = dict(title='T', note='N', variantCatalog=[dict(key='original', label='O'), dict(key='native-lazy', label='L')],
                    scenes=[dict(id='s', title='S', note='scene', commonInputSHA={'rgba':'a'*64}, variants=[
                        dict(id='original', comparisonKey='original', image='images/a.png', label='O', timeMs=123,
                             evidence=dict(timingContract='native-component-diagnostic-loop-v1', sourceHashes={'worker':'x'*10000})),
                        dict(id='lazy', comparisonKey='native-lazy', image='images/b.png', label='L', timeMs=100, comparable=False,
                             nativeTimed=dict(contract='actual',changePercent=-10,baselineMs=110,samples=[{'totalReadyMs':100}]),
                             gridResolution=dict(outputSize=1024,transportGrid=128,provenance={'long':'x'*10000}),
                             evidence=dict(config=dict(physicalDt=4,other=9),timing=dict(newTimeChangePercent=-8),ledger={'x':'z'*10000}))])])
        before = copy.deepcopy(data)
        ui = compact_ui_payload(data)
        self.assertEqual(data,before)
        self.assertEqual(ui['variantCatalog'],data['variantCatalog'])
        for original, compact in zip(data['scenes'][0]['variants'],ui['scenes'][0]['variants']):
            for field in ('id','comparisonKey','image','label','timeMs'):
                self.assertEqual(compact[field],original[field])
        self.assertEqual(ui['scenes'][0]['variants'][0]['evidence']['timingContract'],data['scenes'][0]['variants'][0]['evidence']['timingContract'])
        self.assertEqual(ui['scenes'][0]['variants'][1]['nativeTimed']['changePercent'],-10)
        self.assertEqual(ui['scenes'][0]['variants'][1]['gridResolution']['outputSize'],1024)
        self.assertLess(len(json.dumps(ui)),len(json.dumps(data))/10)
        self.assertNotIn('samples',ui['scenes'][0]['variants'][1]['nativeTimed'])

    def test_native_null_config_is_not_invented(self):
        ui = compact_ui_payload({'scenes':[{'id':'s','variants':[{'id':'original','evidence':{'config':None,'timing':None}}]}]})
        self.assertNotIn('evidence',ui['scenes'][0]['variants'][0])

    def test_all_timing_display_branches_and_missing_catalog_entries_survive(self):
        fields=dict(id='x',comparisonKey='k',image='x.png',earlierComparison=True,baselineMs=12,
                    gainText='same',sameInputVerified=True,resultText='text',timingMode='series',comparable=True,
                    nativeCacheTiming={'changePercent':2,'huge':'x'},modelTiming={'dt4ChangePercent':3},
                    functionalError=True,evidence={'config':{'physicalDt':4},'timing':{'newTimeChangePercent':5}})
        d={'variantCatalog':[{'key':'k','label':'K'},{'key':'missing','label':'not run'}],'scenes':[{'id':'s','variants':[fields]}]}
        u=compact_ui_payload(d)
        v=u['scenes'][0]['variants'][0]
        self.assertEqual(len(u['variantCatalog']),2)
        self.assertEqual(len(u['scenes'][0]['variants']),1)
        for key in ('earlierComparison','baselineMs','gainText','sameInputVerified','resultText','timingMode','comparable','functionalError'):
            self.assertEqual(v[key],fields[key])
        self.assertEqual(v['evidence'],fields['evidence'])
        self.assertEqual(v['nativeCacheTiming'],{'changePercent':2})


if __name__ == '__main__':
    unittest.main()
