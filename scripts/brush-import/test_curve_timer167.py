import unittest,tempfile,json,copy,subprocess,io,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
PIN='11e1f26d6f2f5f9a0d3dfe8e5f6954409ae73c2d'
class CurveTimer167Tests(unittest.TestCase):
 def raw(self,extra=''):return kpp(engine='curvebrush',resources=extra)
 def test_native_hostperiod_literal_and_portable(self):
  for rate,interval in[(20,25),(3,166),(1000,1)]:
   raw=self.raw('<param name="PaintOpSettings/isAirbrushing">true</param><param name="PaintOpSettings/rate">'+str(rate)+'</param>')
   with tempfile.TemporaryDirectory()as tmp:
    c=Catalog(Path(tmp)/'src');b=preset(raw,'own.kpp',c,{},timed_input=True);self.assertEqual(b['descriptor']['version'],167);self.assertEqual(b['descriptor']['behavior']['timing']['rate'],1000/interval);c.brushes.append(b);env={'library':c.write(),'assets':{}};p=Path(tmp)/'input.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'good');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
    with self.assertRaises(ValueError):preset(raw,'own.kpp',Catalog(Path(tmp)/'false'),{},timed_input=False)
    for mode in['version','rate','erase','distance']:
     bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
     if mode=='version':d['version']=53
     elif mode=='rate':d['behavior']['timing']['rateDynamics']=[]
     elif mode=='erase':d['behavior']['erase']=True
     else:d['behavior']['timing']['ignoreDistanceSpacing']=False
     p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/mode)
     with self.assertRaises(ValueError):portable_bundle(p,out)
     self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
 def test_old53_fullrecords_same_pinned_producer(self):
  namespace={'__name__':'baseline_curve'};source=subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_curve.py']);exec(compile(source,'krita_curve.py','exec'),namespace)
  for extra in['','<param name="Curve/smoothing">true</param>','<param name="PressureLine width">true</param><param name="Line widthUseCurve">false</param><param name="Line widthValue">0.5</param>']:
   raw=self.raw(extra);root=ET.fromstring(Image.open(io.BytesIO(raw)).info['preset']);params={n.get('name'):n.text or ''for n in root.findall('param')}
   with tempfile.TemporaryDirectory()as tmp:
    a=preset(raw,'own.kpp',Catalog(Path(tmp)/'new'),{});b=namespace['curve_preset'](raw,root,params,'own.kpp',Catalog(Path(tmp)/'old'),{});self.assertEqual(json.dumps(a,sort_keys=True),json.dumps(b,sort_keys=True))
 def test_unproven_native_options_remain_rejected(self):
  timer='<param name="PaintOpSettings/isAirbrushing">true</param>'
  for extra in['<param name="PressureRate">true</param>','<param name="PaintOpSettings/ignoreSpacing">true</param>','<param name="EraserMode">true</param>','<param name="PaintOpAction">2</param>','<param name="PaintOpSettings/rate">0</param>']:
   with tempfile.TemporaryDirectory()as tmp:
    with self.assertRaises(ValueError):preset(self.raw(timer+extra),'own.kpp',Catalog(Path(tmp)),{},timed_input=True)
if __name__=='__main__':unittest.main()
