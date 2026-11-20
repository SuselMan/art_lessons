import unittest,tempfile,copy,json
from pathlib import Path
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
class Pattern158Tests(unittest.TestCase):
 def test_native_requirement_preserves_bytes_identity_and_old_foreground(self):
  with tempfile.TemporaryDirectory()as directory:
   c=Catalog(Path(directory));raw=kpp(engine='experimentbrush',resources='<param name="Experiment/fillType">1</param>');a=preset(raw,'pattern.kpp',c,{});self.assertEqual(a['descriptor']['version'],158);self.assertEqual(a['descriptor']['experiment']['patternPolicy'],'captured-world-repeat-v1');self.assertEqual(c.assets,{})
   old=preset(kpp(engine='experimentbrush'),'old.kpp',c,{});self.assertEqual(old['descriptor']['version'],50);self.assertNotIn('fill',old['descriptor']['experiment']);self.assertNotEqual(a['descriptor']['id'],old['descriptor']['id'])
   for field in['<param name="Experiment/fillType">2</param>','<param name="Experiment/fillType">1</param><param name="PaintOpSettings/isAirbrushing">true</param>']:
    with self.assertRaises(ValueError):preset(kpp(engine='experimentbrush',resources=field),'invalid.kpp',c,{})
 def test_portable_policy_negatives_are_before_outputs(self):
  with tempfile.TemporaryDirectory()as directory:
   root=Path(directory);d=preset(kpp(engine='experimentbrush',resources='<param name="Experiment/fillType">1</param>'),'pattern.kpp',Catalog(root),{})['descriptor']
   for change in[lambda b:b.update(version=157),lambda b:b['experiment'].pop('patternPolicy'),lambda b:b['behavior'].update(erase=True),lambda b:b.update(model='mixer')]:
    bad=copy.deepcopy(d);change(bad);path=root/'bad.grafetto-brushes.json';path.write_text(json.dumps({'library':{'schemaVersion':1,'brushes':[{'name':'own','source':'qa','warnings':[],'descriptor':bad}],'assets':[],'skipped':[]},'assets':{}}));out=root/'out';out.mkdir(exist_ok=True)
    with self.assertRaises(ValueError):portable_bundle(path,Catalog(out))
    self.assertEqual(list(out.iterdir()),[])
