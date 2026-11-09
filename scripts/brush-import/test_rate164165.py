"""Authored KPP proof + exact previous native outputs, no GUI/art claim."""
import unittest,tempfile,copy,json,subprocess,io,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
PIN='3f6d88ce1edf74e70477e5318beb7dffee9f9283'
TIMER='<param name="PaintOpSettings/isAirbrushing">true</param>'
RATE='<param name="PressureRate">true</param><param name="RateSensor">&lt;params id="pressure"&gt;&lt;curve&gt;0,0;1,1;&lt;/curve&gt;&lt;/params&gt;</param><param name="RateValue">0.5</param>'
class Rate164165Tests(unittest.TestCase):
 def raw(self,family,extra):return kpp(engine={'Sketch':'sketchbrush','Deform':'deformbrush','Particle':'particlebrush'}[family],resources=({'Sketch':'<param name="Sketch/simpleMode">true</param>','Deform':'<param name="Deform/useOldData">true</param>','Particle':''}[family])+extra)
 def test_real_native_dynamic_pressure_strength_and_false_remain_closed(self):
  for family,version in[('Sketch',164),('Deform',165)]:
   raw=self.raw(family,TIMER+RATE)
   with tempfile.TemporaryDirectory()as tmp:
    d=preset(raw,'own.kpp',Catalog(Path(tmp)/'good'),{},timed_input=True)['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['behavior']['timing']['rateDynamics'][0]['control'],'pressure');self.assertEqual(d['behavior']['timing']['rateDynamics'][-1]['curve'],[[0,.5],[1,.5]])
    with self.assertRaises(ValueError):preset(raw,'own.kpp',Catalog(Path(tmp)/'false'),{},timed_input=False)
 def test_exact_previous163_and_static161160_native_outputs(self):
  # Baseline executes ONLY three explicit pinned producer files, not untrusted KPP code.
  for family,filename,funcname in[('Particle','krita_particle.py','particle_preset'),('Sketch','krita_sketch.py','sketch_preset'),('Deform','krita_deform.py','deform_preset')]:
   source=subprocess.check_output(['git','show',PIN+':scripts/brush-import/'+filename]);namespace={'__name__':'baseline_native_rate'};exec(compile(source,filename,'exec'),namespace);baseline=namespace[funcname]
   variants=[TIMER]
   if family=='Particle':variants+=['',TIMER+RATE,'<param name="PaintOpAction">2</param>']
   for extra in variants:
    raw=self.raw(family,extra);root=ET.fromstring(Image.open(io.BytesIO(raw)).info['preset']);params={n.get('name'):n.text or ''for n in root.findall('param')}
    with tempfile.TemporaryDirectory()as tmp:
     current=preset(raw,'own.kpp',Catalog(Path(tmp)/'current'),{},timed_input=True);args=[raw,root,params,'own.kpp',Catalog(Path(tmp)/'baseline'),{}]
     if family=='Sketch':args.append(lambda name:None)
     previous=baseline(*args,timed_input=True);self.assertEqual(json.dumps(current,sort_keys=True,separators=(',',':')),json.dumps(previous,sort_keys=True,separators=(',',':')))
 def test_native_fuzzy_ignore_wash_and_portable_invalid_preoutput(self):
  for family in['Sketch','Deform']:
   for extra in[TIMER+'<param name="PressureRate">true</param><param name="RateSensor">&lt;params id="fuzzy"/&gt;</param>',TIMER+'<param name="PaintOpSettings/ignoreSpacing">true</param>',TIMER+'<param name="Krita/erase">true</param>']:
    with tempfile.TemporaryDirectory()as tmp:
     with self.assertRaises(ValueError):preset(self.raw(family,extra),'own.kpp',Catalog(Path(tmp)),{},timed_input=True)
   with tempfile.TemporaryDirectory()as tmp:
    c=Catalog(Path(tmp)/'source');b=preset(self.raw(family,TIMER+RATE),'own.kpp',c,{},timed_input=True);c.brushes.append(b);env={'library':c.write(),'assets':{}};p=Path(tmp)/'rate.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'positive');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
    for mode in['version','fuzzy','empty','ignore','erase']:
     bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
     if mode=='version':d['version']=161 if family=='Sketch'else 160
     elif mode=='fuzzy':d['behavior']['timing']['rateDynamics'][0]['control']='random'
     elif mode=='empty':d['behavior']['timing']['rateDynamics']=[]
     elif mode=='ignore':d['behavior']['timing']['ignoreDistanceSpacing']=True
     else:d['behavior']['erase']=True
     p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/mode)
     with self.assertRaises(ValueError):portable_bundle(p,out)
     self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
if __name__=='__main__':unittest.main()
