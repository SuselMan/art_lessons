import base64,copy,json,os,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from texture_combinations191 import texture191_scope

@unittest.skipUnless(os.environ.get('TEXTURE191_ARTIFACT')and os.environ.get('TEXTURE191_WORK'),'Authored native Texture191 fixtures are external')
class Texture191Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.artifact=Path(os.environ['TEXTURE191_ARTIFACT']);cls.work=Path(os.environ['TEXTURE191_WORK']);cls.catalog=convert.Catalog(cls.work/'native')
  convert_krita(cls.artifact/'genuine-native191-v4/Own191.native.bundle',cls.catalog)
  cls.library=cls.catalog.write();(cls.artifact/'initial-native-result.json').write_text(json.dumps(cls.library,indent=2)+'\n')
  cls.envelope={'library':cls.library,'assets':{a['id']:base64.b64encode((cls.catalog.output/a['file']).read_bytes()).decode()for a in cls.library['assets']}}
 def require_native(self):
  self.assertEqual(self.catalog.skipped,[]);self.assertEqual(len(self.library['brushes']),21)
 def test_genuine_twentyone_native_entries_semantics_resources_and_whole_portable(self):
  self.require_native();roots=[b['descriptor']for b in self.library['brushes']]
  new=[d for d in roots if d['version']==191];self.assertGreaterEqual(len(new),15);self.assertTrue(all(texture191_scope(d)for d in new))
  modes={d['texture'].get('application',{}).get('mode')for d in roots};self.assertTrue({'height','linearHeight','heightPhotoshop','linearHeightPhotoshop'}<=modes)
  pairs=[d for d in new if'eraseAlpha'in d.get('texture',{}).get('material',{})];self.assertEqual(len(pairs),2)
  for d in pairs:self.assertIn('eraseId',d['texture']);self.assertNotEqual(d['texture']['material']['alpha'],d['texture']['material']['eraseAlpha'])
  masks=[d for d in new if'dual'in d['behavior']];self.assertEqual(len(masks),2);self.assertTrue(all(d['behavior']['dual']['brush']['version']==191 for d in masks))
  input=self.work/'whole.grafetto-brushes.json';input.write_text(json.dumps(self.envelope));out=convert.Catalog(self.work/'portable');convert.portable_bundle(input,out);self.assertEqual(out.write(),self.library)
  target=self.artifact/'canonical191';target.mkdir(exist_ok=True);(target/'library.json').write_text(json.dumps(self.library,indent=2)+'\n')
  for a in self.library['assets']:(target/a['file']).write_bytes((self.catalog.output/a['file']).read_bytes())
 def test_forged_whole_roles_height_versions_paired_alpha_and_primitives_reject_preoutput(self):
  self.require_native();base=copy.deepcopy(self.envelope);material=next(i for i,b in enumerate(base['library']['brushes'])if b['descriptor'].get('texture',{}).get('material',{}).get('eraseAlpha'));height=next(i for i,b in enumerate(base['library']['brushes'])if b['descriptor']['texture'].get('application',{}).get('mode')=='height');mask=next(i for i,b in enumerate(base['library']['brushes'])if'dual'in b['descriptor']['behavior'])
  modern=next(i for i,b in enumerate(base['library']['brushes'])if b['descriptor'].get('mixer',{}).get('algorithm')is not None and b['descriptor']['version']==191)
  cases=[(modern,lambda d:d['behavior'].update(timing={'rate':20,'ignoreDistance':False})),(material,lambda d:d['texture']['material'].pop('eraseAlpha')),(material,lambda d:d['texture']['material'].update(eraseAlpha='asset:'+'0'*64)),(material,lambda d:d['texture'].update(offset={'x':0,'y':0,'randomX':1,'randomY':False})),(material,lambda d:d['behavior']['rendering'].update(mode='bogus')),(material,lambda d:d.update(wet={'edge':0,'mottle':0,'granulation':0,'glaze':False})),(height,lambda d:d.update(version=190)),(height,lambda d:d['texture']['application'].update(mode=['height'])),(mask,lambda d:d['behavior']['dual']['brush'].update(version=190))]
  for index,(which,edit)in enumerate(cases):
   bad=copy.deepcopy(base);edit(bad['library']['brushes'][which]['descriptor']);path=self.work/('bad%d.grafetto-brushes.json'%index);path.write_text(json.dumps(bad));out=convert.Catalog(self.work/('rejected%d'%index))
   with self.subTest(index=index),self.assertRaises(ValueError):convert.portable_bundle(path,out)
   self.assertEqual(list(out.output.iterdir()),[])
  bad=copy.deepcopy(base);bad['library']['brushes']=[bad['library']['brushes'][mask]];bad['library']['brushes'][0]['descriptor']=bad['library']['brushes'][0]['descriptor']['behavior']['dual']['brush'];path=self.work/'orphan.grafetto-brushes.json';path.write_text(json.dumps(bad));out=convert.Catalog(self.work/'orphan')
  with self.assertRaises(ValueError):convert.portable_bundle(path,out)
  self.assertEqual(list(out.output.iterdir()),[])
 @unittest.skipUnless(os.environ.get('TEXTURE191_BUNDLE22'),'Additional authored erase/invert native191 fixture is external')
 def test_modern_smudge_height_erase_auto_invert_pairs_real_gray_and_preserves_prior21(self):
  self.require_native();bundle=Path(os.environ['TEXTURE191_BUNDLE22']);out=convert.Catalog(self.work/'native22');convert_krita(bundle,out);self.assertEqual(out.skipped,[]);library=out.write();self.assertEqual(len(library['brushes']),22)
  before={b['descriptor']['id']:b for b in self.library['brushes']};after={b['descriptor']['id']:b for b in library['brushes']}
  self.assertEqual({key:after[key]for key in before},before)
  for asset in self.library['assets']:
   self.assertEqual(next(a for a in library['assets']if a['id']==asset['id']),asset)
   self.assertEqual((self.catalog.output/asset['file']).read_bytes(),(out.output/asset['file']).read_bytes())
  added=[b for b in library['brushes']if b['descriptor']['id']not in before];self.assertEqual(len(added),1);d=added[0]['descriptor'];self.assertEqual(d['version'],191);self.assertEqual(d['mixer']['algorithm'],'krita-mask');self.assertEqual(d['mixer']['colorRateComposite'],'erase');self.assertIs(d['behavior']['erase'],True);self.assertEqual(d['texture']['application']['mode'],'height');self.assertNotEqual(d['texture']['id'],d['texture']['eraseId'])
  assets={a['id']:a for a in library['assets']};normal=(out.output/assets[d['texture']['id']]['file']).read_bytes();erased=(out.output/assets[d['texture']['eraseId']]['file']).read_bytes();self.assertNotEqual(normal,erased);self.assertTrue(any(normal));self.assertTrue(any(erased))
  envelope={'library':library,'assets':{a['id']:base64.b64encode((out.output/a['file']).read_bytes()).decode()for a in library['assets']}};path=self.work/'whole22.grafetto-brushes.json';path.write_text(json.dumps(envelope));portable=convert.Catalog(self.work/'portable22');convert.portable_bundle(path,portable);self.assertEqual(portable.write(),library)
  target=Path(os.environ['TEXTURE191_CANONICAL22']);target.mkdir(exist_ok=True);(target/'library.json').write_text(json.dumps(library,indent=2)+'\n')
  for a in library['assets']:(target/a['file']).write_bytes((out.output/a['file']).read_bytes())
 def test_existing_foreground_gradient_primitive_is_reused_and_validated(self):
  from convert import validate_portable_mixer
  d={'version':191,'model':'mixer','tip':{'kind':'bitmap'},'paperInteraction':0,'texture':{'id':'asset:'+'a'*64,'periodPx':2,'patternSize':{'width':2,'height':2},'strength':.5,'application':{'mode':'height','soft':False}},'behavior':{'version':2,'rendering':{'mode':'buildUp','blendMode':'normal'}},'mixer':{'algorithm':'krita-mask','load':0,'initialLoad':0,'pickup':.5,'strength':1,'source':'previousCanvas','foreground':{'gradient':{'rate':.5,'value':.25,'positionDynamics':[{'control':'pressure','minimum':0,'jitter':0}]}}}}
  validate_portable_mixer(d,texture191=True)
  d['mixer']['foreground']['gradient']['valueDynamics']=[]
  with self.assertRaises(ValueError):validate_portable_mixer(d,texture191=True)
if __name__=='__main__':unittest.main()
