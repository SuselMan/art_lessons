import copy,json,tempfile,unittest
from pathlib import Path
from review_timing import apply_paused_exact_timing

OLD='wgsl-macro-coherent-physical-dt'
NEW='wgsl-macro-gpu-initial-coherent-dt4'

def report():
    rows=[]
    for algorithm,values in [(OLD,[999,80,100]),(NEW,[888,40,50]),(NEW,[777,50,60]),(OLD,[666,100,120])]:
        config=dict(physicalDt=4,steps=64,mobilityGain=3,eddyCells=8,curlStrength=64)
        if algorithm==NEW:config['verifyInitializer']=0
        q=dict(algorithm=algorithm,fixture='mini-wave',config=config,encoding='optical-density',idleBetweenMs=5000)
        r={k:copy.deepcopy(v) for k,v in q.items() if k!='idleBetweenMs'}
        r.update(fixtureSHA=dict(rgba='r',water='w',paper='p'),hardware=dict(vendor='qualcomm'),repeatExact=True,hashes=['same']*3,samples=[dict(totalReadyMs=v,idleBeforeSampleMs=5001 if i else 0) for i,v in enumerate(values)])
        rows.append(dict(request=q,result=r,**{'pass':True}))
    return dict(sourceStable=True,contextClosed=True,errors=[],cases=rows,**{'pass':True})

class PausedExact(unittest.TestCase):
    def run_report(self,r,scenes):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'report.json';p.write_text(json.dumps(r));return apply_paused_exact_timing(scenes,[p])
    def test_exact_backend_pair_pools_raw_paused_samples_and_replaces_previous_headline_series(self):
        r=report();variants=[dict(evidence=copy.deepcopy(x['result']),note='original note',modelTiming={'prior':'series'},timeMs=999) for x in r['cases'][:2]]
        self.run_report(r,[dict(variants=variants)])
        self.assertEqual([v['timeMs'] for v in variants],[100,50]);self.assertEqual(variants[1]['evidence']['timing']['newTimeChangePercent'],-50)
        self.assertTrue(all(v['timingMode']=='после паузы' and not v['comparable'] for v in variants))
        self.assertNotIn('modelTiming',variants[0]);self.assertIn('previousModelTiming',variants[0]);self.assertNotIn('gainText',variants[0]);self.assertIn('gainText',variants[1])
        self.assertTrue(variants[0]['note'].startswith('original note'))
    def test_reject_short_actual_pause_changed_pixels_diagnostic_and_bad_order(self):
        for mode in ('pause','pixels','diagnostic','order'):
            r=report()
            if mode=='pause':r['cases'][1]['result']['samples'][1]['idleBeforeSampleMs']=4800
            if mode=='pixels':r['cases'][1]['result']['hashes']=['different']*3
            if mode=='diagnostic':
                for k in ('request','result'):r['cases'][1][k]['config']['verifyInitializer']=1
            if mode=='order':r['cases'][1],r['cases'][3]=r['cases'][3],r['cases'][1]
            with self.assertRaises(ValueError):self.run_report(r,[])
    def test_card_cannot_borrow_other_output_or_overwrite_native(self):
        r=report();e=copy.deepcopy(r['cases'][1]['result']);e['hashes']=['other']*3
        with self.assertRaises(ValueError):self.run_report(r,[dict(variants=[dict(evidence=e,note='')])])
        native=dict(id='original',timeMs=700);self.run_report(r,[dict(variants=[native])]);self.assertEqual(native,dict(id='original',timeMs=700))
if __name__=='__main__':unittest.main()
