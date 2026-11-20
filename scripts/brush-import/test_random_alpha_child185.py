import unittest,tempfile,copy,json,base64,subprocess
from pathlib import Path
import test_animated_alpha_child184 as old184
from test_sketch_gih174 import pipe174
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
class RandomAlphaChild185Tests(unittest.TestCase):
 def test_genuine_random_special_pair_and_portable_whole(self):
  for mode in('hard_mix_softer_photoshop','hard_mix_photoshop'):
   with self.subTest(mode=mode),tempfile.TemporaryDirectory()as tmp:
    c=Catalog(Path(tmp)/'native');r=preset(old184.AnimatedAlphaChild184Tests().raw(mode),'Own185.kpp',c,{'own184.gih':pipe174('random')});c.brushes.append(r);self.assertEqual(r['descriptor']['version'],185);a=r['descriptor']['behavior']['dual']['brush']['tip']['animation'];self.assertEqual(a['mode'],'random');self.assertEqual(len(a['frames']),2);self.assertNotIn('rank',a);self.assertTrue(any(n['feature']=='masking.animatedAlphaRandom185'for n in r['compatibility']));lib=c.write();env={'library':lib,'assets':{v['id']:base64.b64encode((c.output/v['file']).read_bytes()).decode()for v in lib['assets']}};p=Path(tmp)/'portable.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'out');portable_bundle(p,out);self.assertEqual(out.brushes,[r]);self.assertEqual(out.write()['assets'],lib['assets'])
    for version in(184,186):
     bad=copy.deepcopy(env);bad['library']['brushes'][0]['descriptor']['version']=version;p.write_text(json.dumps(bad));denied=Catalog(Path(tmp)/str(version))
     with self.assertRaises(ValueError):portable_bundle(p,denied)
     self.assertFalse(denied.brushes);self.assertFalse(denied.assets)
 def test_all_old_generic_and184_whole_records_stay_identical(self):
  ns={'__name__':'old_import'};exec(compile(subprocess.check_output(['git','show','019e192c5d9213a6c64e4873e6c929dcb52fc763:scripts/brush-import/krita_import.py']),'old_import.py','exec'),ns)
  for blend in('multiply','subtract','darken','hard_mix_softer_photoshop','hard_mix_photoshop'):
   for mode in('constant','incremental','pressure','random'):
    if mode=='random'and blend.startswith('hard_mix'):continue
    with self.subTest(blend=blend,mode=mode),tempfile.TemporaryDirectory()as tmp:
     raw=old184.AnimatedAlphaChild184Tests().raw(blend);res={'own184.gih':pipe174(mode)};self.assertEqual(preset(raw,'Old.kpp',Catalog(Path(tmp)/'new'),res),ns['preset'](raw,'Old.kpp',Catalog(Path(tmp)/'old'),res))
