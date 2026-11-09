import unittest,tempfile,copy,json
from pathlib import Path
from test_krita import kpp
from krita_import import preset,DEFAULT_NATIVE_INPUT_POLICY
from brush_contract import Catalog
from convert import portable_bundle
from particle_timer157 import particle_timer157_scope
class ParticleRate163Tests(unittest.TestCase):
 def make(self,extra='',timed=True,default=False):
  raw=kpp(engine='particlebrush',resources=extra)
  with tempfile.TemporaryDirectory()as tmp:return preset(raw,'rate.kpp',Catalog(Path(tmp)),{},timed_input=timed,_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY if default else None)
 def dynamic(self,extra=''):
  return self.make('<param name="PaintOpSettings/isAirbrushing">true</param><param name="PressureRate">true</param><param name="RateSensor">&lt;params id="pressure"&gt;&lt;curve&gt;0,0;1,1;&lt;/curve&gt;&lt;/params&gt;</param>'+extra)
 def test_native_checked_pressure_and_strength_not_silently_discarded(self):
  b=self.dynamic('<param name="RateValue">0.5</param>');d=b['descriptor'];self.assertEqual(d['version'],163);self.assertTrue(particle_timer157_scope(d));controls=d['behavior']['timing']['rateDynamics'];self.assertEqual(controls[0]['control'],'pressure');self.assertEqual(controls[-1]['curve'],[[0,.5],[1,.5]])
 def test_static157_and_untimed49_fullrecords_unchanged_across_default_optin(self):
  for extra in['','<param name="PaintOpSettings/isAirbrushing">true</param>']:
   a=self.make(extra);self.assertEqual(a,self.make(extra,False,True));self.assertEqual(a['descriptor']['version'],157 if extra else 49)
  self.assertEqual(self.make('',False),self.make(''))
  with self.assertRaises(ValueError):self.make('<param name="PaintOpSettings/isAirbrushing">true</param><param name="PressureRate">true</param>',False)
 def test_fuzzy_strength_bad_rate_and_wash_closed(self):
  for extra in['<param name="RateSensor">&lt;params id="fuzzy"/&gt;</param>','<param name="RateValue">2</param>','<param name="PaintOpAction">2</param>','<param name="PaintOpSettings/ignoreSpacing">true</param>']:
   # For fuzzy use single RateSensor, not duplicated XML.
   if 'RateSensor'in extra:
    text='<param name="PaintOpSettings/isAirbrushing">true</param><param name="PressureRate">true</param>'+extra
    with self.assertRaises(ValueError):self.make(text)
   else:
    with self.assertRaises(ValueError):self.dynamic(extra)
 def test_portable_positive_and_rejection_before_outputs(self):
  b=self.dynamic()
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp)/'source');c.brushes.append(b);env={'library':c.write(),'assets':{}};p=Path(tmp)/'rate.json';p.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(p,good);self.assertEqual(good.brushes,[b])
   for case in['downgrade','fuzzy','jitter','empty','erase']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
    if case=='downgrade':d['version']=157
    elif case=='fuzzy':d['behavior']['timing']['rateDynamics'][0]['control']='random'
    elif case=='jitter':d['behavior']['timing']['rateDynamics'][0]['jitter']=.1
    elif case=='empty':d['behavior']['timing']['rateDynamics']=[]
    else:d['behavior']['erase']=True
    p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/case)
    with self.assertRaises(ValueError):portable_bundle(p,out)
    self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
if __name__=='__main__':unittest.main()
