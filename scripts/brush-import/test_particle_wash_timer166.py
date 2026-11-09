import unittest,tempfile,json,copy
from pathlib import Path
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
TIMER='<param name="PaintOpSettings/isAirbrushing">true</param>'
WASH='<param name="PaintOpAction">2</param>'
RATE='<param name="PressureRate">true</param><param name="RateSensor">&lt;params id="pressure"&gt;&lt;curve&gt;0,0;1,1;&lt;/curve&gt;&lt;/params&gt;</param><param name="RateValue">0.5</param>'
class ParticleWashTimer166Tests(unittest.TestCase):
 def test_native_static_dynamic_fullportable_and_explicit_false(self):
  for rate in['',RATE]:
   raw=kpp(engine='particlebrush',resources=TIMER+WASH+rate)
   with tempfile.TemporaryDirectory()as tmp:
    c=Catalog(Path(tmp)/'src');b=preset(raw,'own.kpp',c,{},timed_input=True);self.assertEqual(b['descriptor']['version'],166);self.assertEqual(b['descriptor']['behavior']['rendering']['accumulation'],'alphaDarken');c.brushes.append(b);env={'library':c.write(),'assets':{}};p=Path(tmp)/'env.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'good');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
    with self.assertRaises(ValueError):preset(raw,'own.kpp',Catalog(Path(tmp)/'false'),{},timed_input=False)
    for mode in['version','erase','ignore','fuzzy']:
     bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
     if mode=='version':d['version']=163
     elif mode=='erase':d['behavior']['erase']=True
     elif mode=='ignore':d['behavior']['timing']['ignoreDistanceSpacing']=True
     else:d['behavior']['timing']['rateDynamics']=[{'control':'random','minimum':0,'jitter':0,'curve':[[0,0],[1,1]]}]
     p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/mode)
     with self.assertRaises(ValueError):portable_bundle(p,out)
     self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
if __name__=='__main__':unittest.main()
