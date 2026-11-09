import copy,json,tempfile,unittest
from pathlib import Path
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset,DEFAULT_NATIVE_INPUT_POLICY
from convert import portable_bundle
from deform_timer160 import deform_timer160_scope,validate_deform_timer160
class DeformTimer160Tests(unittest.TestCase):
    def make(self,extra='',timed=False,default=False):
        raw=kpp(engine='deformbrush',mode='copy',resources=extra)
        with tempfile.TemporaryDirectory()as tmp:return preset(raw,'deform.kpp',Catalog(Path(tmp)),{},timed_input=timed,_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY if default else None)
    def test_native_checked_timer_canonical_old_source_and_default(self):
        p='<param name="Deform/useOldData">true</param><param name="PaintOpSettings/isAirbrushing">true</param><param name="PaintOpSettings/rate">100.13</param>'
        a=self.make(p,timed=True);self.assertEqual(a,self.make(p,default=True));d=a['descriptor'];self.assertEqual(d['version'],160);self.assertTrue(deform_timer160_scope(d));self.assertEqual(d['behavior']['timing']['rate'],100.13);self.assertEqual(d['deform']['sourcePolicy'],'canonical-begin-v1')
        with self.assertRaisesRegex(ValueError,'timed'):self.make(p)
    def test_false_true_untimed_preserve_complete_historical51_145_records(self):
        for p,v in [('',51),('<param name="Deform/useOldData">true</param>',145)]:
            a=self.make(p);self.assertEqual(a,self.make(p,timed=True));self.assertEqual(a,self.make(p,default=True));self.assertEqual(a['descriptor']['version'],v)
    def test_alias_no_old_rate_dynamic_ignore_and_erase_rejected(self):
        old='<param name="Deform/useOldData">true</param>';timer='<param name="PaintOpSettings/isAirbrushing">true</param>'
        for p in [old+'<param name="AirbrushOption/isAirbrushing">true</param>',timer,old+timer+'<param name="PressureRate">true</param><param name="RateSensor">&lt;params id="fuzzy"/&gt;</param>',old+timer+'<param name="PaintOpSettings/rate">0</param>',old+timer+'<param name="PaintOpSettings/ignoreSpacing">true</param>',old+timer+'<param name="EraserMode">true</param>']:
            with self.assertRaises(ValueError):self.make(p,timed=True)
        # Native settings legacy fallback alone is NOT checked AirbrushOptionData.
        legacy=old+'<param name="Deform/useMovementPaint">true</param>';self.assertEqual(self.make(legacy),self.make(legacy,timed=True));self.assertEqual(self.make(legacy)['descriptor']['version'],145)
    def test_full_portable_preoutput_and_closed_child(self):
        record=self.make('<param name="Deform/useOldData">true</param><param name="PaintOpSettings/isAirbrushing">true</param>',timed=True)
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp)/'source');c.brushes.append(record);env={'library':c.write(),'assets':{}};path=Path(tmp)/'deform.grafetto-brushes.json';path.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(path,good);self.assertEqual(good.brushes,[record])
            for case in ['version','source','rate','dynamic','erase']:
                bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
                if case=='version':d['version']=159
                elif case=='source':del d['deform']['sourcePolicy']
                elif case=='rate':d['behavior']['timing']['rate']=0
                elif case=='dynamic':d['behavior']['timing']['rateDynamics']=[]
                else:d['behavior']['erase']=True
                path.write_text(json.dumps(bad));target=Catalog(Path(tmp)/('negative-'+case))
                with self.assertRaises(ValueError):portable_bundle(path,target)
                self.assertEqual(target.brushes,[]);self.assertEqual(target.assets,{});self.assertEqual(list(target.output.iterdir()),[])
        with self.assertRaises(ValueError):validate_deform_timer160(record['descriptor'],1)
if __name__=='__main__':unittest.main()
