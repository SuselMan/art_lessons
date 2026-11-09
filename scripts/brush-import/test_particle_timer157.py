"""Authored native timer inputs, not synthetic vendor or native pixel proof."""
import copy,tempfile,unittest,json
from pathlib import Path
from test_krita import kpp
from krita_import import preset,DEFAULT_NATIVE_INPUT_POLICY
from brush_contract import Catalog
from convert import portable_bundle
from particle_timer157 import particle_timer157_scope,validate_particle_timer157
class ParticleTimer157Tests(unittest.TestCase):
    def make(self,extra='',timed=False,default=False):
        data=kpp(engine='particlebrush',resources=extra)
        with tempfile.TemporaryDirectory()as directory:return preset(data,'particle.kpp',Catalog(Path(directory)),{},timed_input=timed,_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY if default else None)
    def test_actual_native_static_timer_and_default_closed_scope(self):
        params='<param name="PaintOpSettings/isAirbrushing">true</param><param name="PaintOpSettings/rate">100.13</param>'
        a=self.make(params,timed=True);b=self.make(params,default=True)
        self.assertEqual(a,b);d=a['descriptor'];self.assertEqual(d['version'],157);self.assertTrue(particle_timer157_scope(d));self.assertEqual(d['behavior']['timing']['rate'],100.13);validate_particle_timer157(d)
        with self.assertRaisesRegex(ValueError,'timed'):self.make(params,timed=False)
    def test_false_and_untimed_true_preserve_full_49_134_records(self):
        for p in ['', '<param name="PaintOpAction">2</param>']:
            a=self.make(p,timed=False);self.assertEqual(a,self.make(p,timed=True));self.assertEqual(a,self.make(p,default=True));self.assertEqual(a['descriptor']['version'],134 if p else 49)
    def test_active_unclosed_alias_rate_wash_controls_rejected(self):
        timer='<param name="PaintOpSettings/isAirbrushing">true</param>'
        for p in ['<param name="AirbrushOption/isAirbrushing">true</param>',timer+'<param name="PressureRate">true</param>',timer+'<param name="PaintOpAction">2</param>',timer+'<param name="PaintOpSettings/ignoreSpacing">true</param>',timer+'<param name="PaintOpSettings/rate">0</param>']:
            with self.assertRaises(ValueError):self.make(p,timed=True)
    def test_portable_preoutput_scope_parent_and_downgrade(self):
        d=self.make('<param name="PaintOpSettings/isAirbrushing">true</param>',timed=True)['descriptor']
        for mutate in [lambda x:x.update(version=156),lambda x:x['behavior'].update(erase=True),lambda x:x['behavior']['timing'].update(rateDynamics=[]),lambda x:x['behavior']['rendering'].update(accumulation='alphaDarken')]:
            bad=copy.deepcopy(d);mutate(bad)
            with self.assertRaises(ValueError):validate_particle_timer157(bad)
        with self.assertRaises(ValueError):validate_particle_timer157(d,{})
    def test_real_portable_bundle_validates_before_catalog_outputs(self):
        record=self.make('<param name="PaintOpSettings/isAirbrushing">true</param>',timed=True)
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp)/'source');c.brushes.append(record);env={'library':c.write(),'assets':{}};path=Path(tmp)/'timer.grafetto-brushes.json';path.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(path,good);self.assertEqual(good.brushes,[record])
            for case in ['version','wash','dynamic','erase']:
                bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
                if case=='version':d['version']=156
                elif case=='wash':d['behavior']['rendering']['accumulation']='alphaDarken'
                elif case=='dynamic':d['behavior']['timing']['rateDynamics']=[]
                else:d['behavior']['erase']=True
                path.write_text(json.dumps(bad));target=Catalog(Path(tmp)/case)
                with self.assertRaises(ValueError):portable_bundle(path,target)
                self.assertEqual(target.brushes,[]);self.assertEqual(target.assets,{});self.assertEqual(list(target.output.iterdir()),[])
if __name__=='__main__':unittest.main()
