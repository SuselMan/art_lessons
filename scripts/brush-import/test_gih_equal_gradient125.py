from pathlib import Path
import tempfile,unittest,copy,json,base64,hashlib
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from test_krita import kpp
from test_gih_equal_lightness123 import pipe123
class EqualGradient125Tests(unittest.TestCase):
 def imported(self,tmp,dims=None,application=3,engine='paintbrush',sizes=None,actual=3):
  dims=dims or [('xtilt',5)];root=Path(tmp);raw=kpp('<Brush type="gbr_brush" filename="equal125.gih" brushApplication="'+str(application)+'" scale="1" AdjustmentVersion="2" AutoAdjustMidPoint="false" AdjustmentMidPoint="127" BrightnessAdjustment="0" ContrastAdjustment="0"/>',engine=engine);path=root/'Own125.kpp';path.write_bytes(raw);out=convert.Catalog(root/'native');convert_krita(path,out,{'equal125.gih':pipe123(dims,sizes,actual)});return out,raw
 def test_native_all125_modes_literal_independent_gray_alpha_and_original_identity(self):
  for dims in[[('angular',5)],[('xtilt',5)],[('ytilt',5)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    out,raw=self.imported(tmp,dims);self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],125);self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id']);t=d['tip'];a=t['animation'];g=t['color']['gradient'];self.assertNotIn('geometry',a);self.assertNotIn('material',t);self.assertEqual(g['sampling'],'filteredGray-v1');self.assertEqual(g['grayFrames'][0],g['gray']);self.assertEqual(len(set(a['frames'])),1);self.assertEqual(len(set(g['grayFrames'])),3)
    for i,value in enumerate([87,127,39]):
     for aid,byte in[(a['frames'][i],255),(g['grayFrames'][i],value)]:
      expected=bytes([0]*4+[byte]*8+[0]*4);self.assertEqual((out.output/out.assets[aid]['file']).read_bytes(),expected);self.assertEqual(aid,'asset:'+hashlib.sha256(expected).hexdigest())
 def test_native_unequal_foreign_and_single_frame_do_not_gain125(self):
  for kwargs in[{'engine':e}for e in['hairybrush','hatchingbrush','sketchbrush','curvebrush']]+[{'sizes':[(4,2),(8,6),(4,2)]},{'sizes':[(1024,2)]*3}]:
   with self.subTest(kwargs=kwargs),tempfile.TemporaryDirectory()as tmp:
    out,_=self.imported(tmp,**kwargs);self.assertFalse(any(b['descriptor']['version']==125 for b in out.brushes))
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp,[('incremental',3)],actual=1);self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],100);self.assertNotIn('animation',d['tip']);self.assertEqual(d['tip']['color']['gradient']['sampling'],'filteredGray-v1')
 def test_old121_123_application_paths_are_not_reinterpreted(self):
  for app,version in[(1,121),(2,123)]:
   with tempfile.TemporaryDirectory()as tmp:
    out,_=self.imported(tmp,application=app);self.assertEqual(out.skipped,[]);self.assertEqual(out.brushes[0]['descriptor']['version'],version)
 def test_portable125_full_positive_and_closed_scope_reject_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp);env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=Path(tmp)/'own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
   for case in['revision124','missingSampling','wrongSampling','missingGray','rootGray','badRef','wrongSide','over512','geometry','rounding','rank','material','RGB','imageSampling','dual','child','texture','erase','timer','cloneNull']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];t=d['tip'];a=t['animation'];g=t['color']['gradient']
    if case=='revision124':d['version']=124
    elif case=='missingSampling':g.pop('sampling')
    elif case=='wrongSampling':g['sampling']='mapped-v1'
    elif case=='missingGray':g['grayFrames'].pop()
    elif case=='rootGray':g['gray']=g['grayFrames'][1]
    elif case=='badRef':g['grayFrames'][1]='bad'
    elif case in('wrongSide','over512'):
     side=8 if case=='wrongSide'else 1024;raw=bytes(side*side);digest=hashlib.sha256(raw).hexdigest();aid='asset:'+digest;bad['assets'][aid]=base64.b64encode(raw).decode();bad['library']['assets'].append({'id':aid,'size':side,'file':digest+'.bin'});g['grayFrames'][1]=aid
    elif case=='geometry':a['geometry']={'version':1,'frames':[{'sourceWidth':4,'sourceHeight':2,'maskBounds':t['maskBounds']}for _ in a['frames']]}
    elif case=='rounding':a['roundingPolicy']='away-v1'
    elif case=='rank':a['rank']=1
    elif case=='material':t['material']={'kind':'lightness','gray':g['gray'],'grayFrames':g['grayFrames'],'strength':1}
    elif case=='RGB':t['color']['planes']=[g['gray']]*3
    elif case=='imageSampling':t['imageSampling']={}
    elif case=='dual':d['behavior']['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);t.pop('animation');t.pop('color');d['behavior']['dual']={'brush':child,'blendMode':'normal'}
    elif case=='texture':d['texture']={}
    elif case=='erase':d['behavior']['erase']=True
    elif case=='timer':d['behavior']['timing']={}
    else:d['clone']=None
    path.write_text(json.dumps(bad));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{});self.assertEqual(list(dest.output.iterdir()),[])
