from pathlib import Path
import tempfile,unittest,copy,json,base64,hashlib
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from test_krita import kpp
from test_gih_original_rgba119 import pipe as rgba_pipe
from test_gih_geometry118 import data as alpha118_data
SIZES=[(4,2)]*3
class EqualOriginalRgba121Tests(unittest.TestCase):
 def imported(self,tmp,dims=None,**kwargs):
  dims=dims or [('xtilt',5)];root=Path(tmp);original=kpp('<Brush type="gbr_brush" filename="equal121.gih" brushApplication="1" scale="1"/>',engine=kwargs.get('engine','paintbrush'),resources=kwargs.get('extra',''));path=root/'Own121.kpp';path.write_bytes(original);out=convert.Catalog(root/'native');convert_krita(path,out,{'equal121.gih':rgba_pipe(dims,sizes=SIZES,actual=kwargs.get('actual',3))});return out,original
 def test_equal121_all_sensors_have_samealpha_distinctRGB_literal_planes_and_original_id(self):
  for dims in[[('angular',5)],[('xtilt',5)],[('ytilt',5)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    out,original=self.imported(tmp,dims);self.assertEqual(out.skipped,[]);self.assertEqual(len(out.brushes),1);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],121);self.assertEqual(finalize_identity(copy.deepcopy(d),original)['id'],d['id']);tip=d['tip'];a=tip['animation'];color=tip['color'];self.assertNotIn('geometry',a);self.assertEqual(a['frames'][0],a['frames'][2]);self.assertNotEqual(color['frames'][0],color['frames'][2]);self.assertEqual(color['planes'],color['frames'][0])
    for index in range(3):
     for channel,aid in enumerate([*color['frames'][index],a['frames'][index]]):
      value=128 if channel==3 and index==1 else 255 if channel==3 or channel==index else 0;expected=bytes([0]*4+[value]*8+[0]*4);asset=out.assets[aid];self.assertEqual(asset['size'],4);self.assertEqual((out.output/asset['file']).read_bytes(),expected);self.assertEqual(aid,'asset:'+hashlib.sha256(expected).hexdigest())
 def test_old119_118_86_and_singleEOF_do_not_change_or_claim121(self):
  for app,dims,raw,version in[(1,[('xtilt',5)],rgba_pipe([('xtilt',5)]),119),(1,[('incremental',3)],rgba_pipe([('incremental',3)]),86),(0,[('xtilt',5)],alpha118_data([('xtilt',5)]),118),(0,[('xtilt',5)],alpha118_data([('xtilt',5)],actual=1),27)]:
   with self.subTest(version=version),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);path=root/'Old.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="old.gih" brushApplication="'+str(app)+'" scale="1"/>'));out=convert.Catalog(root/'out');convert_krita(path,out,{'old.gih':raw});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],version)
    if version==27:self.assertNotIn('animation',d['tip'])
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp,actual=1);self.assertEqual(out.brushes,[]);self.assertTrue(out.skipped)
 def test_foreign_origins_and_colour_applications_do_not_gain121(self):
  for engine in['hairybrush','hatchingbrush','curvebrush','sketchbrush']:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    out,_=self.imported(tmp,engine=engine);self.assertFalse(any(v['descriptor'].get('version')==121 for v in out.brushes))
 def test_full_portable_positive_and_closed121_scope_before_any_output(self):
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp);env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/asset['file']).read_bytes()).decode()for aid,asset in out.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
   for case in['revision119','revision120','missingRGB','rootRGB','wrongSide','unequalAlpha','geometry','rootMask','rounding','rank','gradient','sampling','material','dual','child','texture','erase','timer','cloneNull']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];tip=d['tip'];a=tip['animation'];rgb=tip['color']
    if case.startswith('revision'):d['version']=int(case[8:])
    elif case=='missingRGB':rgb['frames'].pop()
    elif case=='rootRGB':rgb['planes']=rgb['frames'][1][:]
    elif case in('wrongSide','unequalAlpha'):
     raw=bytes(64);digest=hashlib.sha256(raw).hexdigest();aid='asset:'+digest;bad['assets'][aid]=base64.b64encode(raw).decode();bad['library']['assets'].append({'id':aid,'size':8,'file':digest+'.bin'})
     if case=='wrongSide':rgb['frames'][1][0]=aid
     else:a['frames'][1]=aid
    elif case=='geometry':a['geometry']={'version':1,'frames':[{'sourceWidth':4,'sourceHeight':2,'maskBounds':tip['maskBounds']}for _ in a['frames']]}
    elif case=='rootMask':a['frames'][0]=a['frames'][1]
    elif case=='rounding':a['roundingPolicy']='away-v1'
    elif case=='rank':a['rank']=1
    elif case=='gradient':tip['color']={'gradient':{'gray':a['frames'][0]}}
    elif case=='sampling':tip['imageSampling']={}
    elif case=='material':tip['material']={}
    elif case=='dual':d['behavior']['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);tip.pop('animation');tip.pop('color');d['behavior']['dual']={'brush':child,'blendMode':'normal'}
    elif case=='texture':d['texture']={}
    elif case=='erase':d['behavior']['erase']=True
    elif case=='timer':d['behavior']['timing']={}
    else:d['clone']=None
    path.write_text(json.dumps(bad));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{});self.assertEqual(list(dest.output.iterdir()),[])
