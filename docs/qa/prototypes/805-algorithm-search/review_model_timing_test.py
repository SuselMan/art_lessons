import copy,json,tempfile,unittest
from pathlib import Path
from review_model_timing import read_model_timings,apply_model_timing

def report():
    rows=[]
    for dt,values in [(1,[999,100,120]),(4,[888,50,60]),(4,[777,70,80]),(1,[666,140,160])]:
        q={'algorithm':'wgsl-macro-coherent-physical-dt','fixture':'mini-wave','encoding':'optical-density','config':{'physicalDt':dt,'steps':256//dt,'eddyCells':8,'curlStrength':64},'idleBetweenMs':5000}
        r={k:copy.deepcopy(v) for k,v in q.items() if k!='idleBetweenMs'}
        r.update(repeatExact=True,fixtureSHA={'rgba':'r','water':'w','paper':'p'},hardware={'vendor':'qualcomm'},hashes=[f'h{dt}']*3,samples=[{'totalReadyMs':v,'idleBeforeSampleMs':5000 if i else 0} for i,v in enumerate(values)])
        rows.append({'request':q,'result':r,'pass':True})
    return {'pass':True,'sourceStable':True,'contextClosed':True,'errors':[],'cases':rows}

class ModelTiming(unittest.TestCase):
    def run_report(self,r,callback):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'report.json';p.write_text(json.dumps(r));return callback([p])
    def test_raw_paused_pool_not_medians_and_explicit_picture_change(self):
        r=report();e=copy.deepcopy(r['cases'][1]['result']);scene={'variants':[{'evidence':e,'note':'','comparable':False}]}
        self.run_report(r,lambda paths:apply_model_timing([scene],paths))
        v=scene['variants'][0];self.assertEqual(v['timeMs'],65);self.assertEqual(v['modelTiming']['arms'][1]['medianMs'],130)
        self.assertEqual(v['modelTiming']['dt4ChangePercent'],-50);self.assertTrue(v['modelTiming']['picturesMayDiffer']);self.assertFalse(v['comparable'])
    def test_bad_order_short_pause_changed_input_and_unstable_output_reject(self):
        for mutate in [lambda r:r['cases'].append(r['cases'].pop(1)),lambda r:r['cases'][1]['result']['samples'][1].update(idleBeforeSampleMs=4800),lambda r:r['cases'][2]['result']['fixtureSHA'].update(water='other'),lambda r:r['cases'][2]['result'].update(hashes=['other']*3)]:
            r=report()
            mutate(r)
            with self.assertRaises(ValueError):self.run_report(r,read_model_timings)
    def test_card_requires_its_own_pixels_and_original_model_untouched(self):
        r=report();e=copy.deepcopy(r['cases'][1]['result']);e['hashes']=['wrong']*3
        with self.assertRaises(ValueError):self.run_report(r,lambda paths:apply_model_timing([{'variants':[{'evidence':e,'note':''}]}],paths))
        original={'id':'original','timeMs':700};self.run_report(r,lambda paths:apply_model_timing([{'variants':[original]}],paths));self.assertEqual(original,{'id':'original','timeMs':700})
if __name__=='__main__':unittest.main()
