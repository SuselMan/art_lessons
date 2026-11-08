from pathlib import Path
import tempfile,unittest,copy,json,base64,hashlib,struct,math
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from test_krita import kpp
from test_gih_original_rgba119 import pipe as rgba119_pipe
from test_gih_geometry118 import data as alpha118_data

def pipe123(dims,sizes=None,actual=3):
 sizes=sizes or [(4,2)]*3;n=math.prod(rank for mode,rank in dims);header=f'{n} dim:{len(dims)} ncells:{n} '+' '.join(f'rank{i}:{rank} sel{i}:{mode}'for i,(mode,rank)in enumerate(dims));frames=[]
 for index,(w,h)in enumerate(sizes[:actual]):
  rgba=bytes(value for y in range(h)for x in range(w)for value in(*[(255 if c==index else 0)for c in range(3)],255));frames.append(struct.pack('>7I',29,2,w,h,4,0x47494d50,25)+b'\0'+rgba)
 return('Own123\n'+header+'\n').encode()+b''.join(frames)
class EqualLightness123Tests(unittest.TestCase):
 def imported(self,tmp,dims=None,application=2,engine='paintbrush',sizes=None,actual=3,extra=''):
  dims=dims or [('xtilt',5)];root=Path(tmp);original=kpp('<Brush type="gbr_brush" filename="equal123.gih" brushApplication="'+str(application)+'" scale="1" AdjustmentVersion="2" AutoAdjustMidPoint="false" AdjustmentMidPoint="127" BrightnessAdjustment="0" ContrastAdjustment="0"/>',engine=engine,resources=extra);path=root/'Own123.kpp';path.write_bytes(original);out=convert.Catalog(root/'native');convert_krita(path,out,{'equal123.gih':pipe123(dims,sizes,actual)});return out,original
 def test_genuine_all123_sensors_qGray_alpha_literal_CAS_and_original_identity(self):
  for dims in[[('angular',5)],[('xtilt',5)],[('ytilt',5)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    out,original=self.imported(tmp,dims);self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],123);self.assertEqual(finalize_identity(copy.deepcopy(d),original)['id'],d['id']);tip=d['tip'];a=tip['animation'];m=tip['material'];self.assertNotIn('geometry',a);self.assertNotIn('color',tip);self.assertEqual(len(set(a['frames'])),1);self.assertEqual(m['gray'],m['grayFrames'][0]);self.assertEqual(len(set(m['grayFrames'])),3);self.assertEqual(m['strength'],1)
    for index,gray in enumerate([87,127,39]):
     for aid,value in[(a['frames'][index],255),(m['grayFrames'][index],gray)]:
      expected=bytes([0]*4+[value]*8+[0]*4);asset=out.assets[aid];self.assertEqual(asset['size'],4);self.assertEqual((out.output/asset['file']).read_bytes(),expected);self.assertEqual(aid,'asset:'+hashlib.sha256(expected).hexdigest())
 def test_old_material_strength_controls_and_old119_118_121_geometry_do_not_change(self):
  with tempfile.TemporaryDirectory()as tmp:
   extra='<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthUseCurve">false</param><param name="LightnessStrengthValue">.25</param>';out,_=self.imported(tmp,extra=extra);self.assertEqual(out.skipped,[]);self.assertEqual(out.brushes[0]['descriptor']['tip']['material']['strength'],.25)
  for application,raw,version in[(1,rgba119_pipe([('xtilt',5)]),119),(0,alpha118_data([('xtilt',5)]),118)]:
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);path=root/'Old.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="old.gih" brushApplication="'+str(application)+'" scale="1"/>'));out=convert.Catalog(root/'out');convert_krita(path,out,{'old.gih':raw});self.assertEqual(out.skipped,[]);self.assertEqual(out.brushes[0]['descriptor']['version'],version)
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp,application=1);self.assertEqual(out.skipped,[]);self.assertEqual(out.brushes[0]['descriptor']['version'],121);self.assertIn('color',out.brushes[0]['descriptor']['tip'])
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp,dims=[('incremental',3)],actual=1);self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertLess(d['version'],123);self.assertNotIn('animation',d['tip']);self.assertIn('material',d['tip'])
 def test_foreign_and_actual1_sensor_remain_closed(self):
  for kwargs in[{'engine':e}for e in['hairybrush','hatchingbrush','sketchbrush','curvebrush']]+[{'actual':1}]:
   with self.subTest(kwargs=kwargs),tempfile.TemporaryDirectory()as tmp:
    out,_=self.imported(tmp,**kwargs);self.assertFalse(any(v['descriptor']['version']==123 for v in out.brushes))
    if 'engine'not in kwargs:self.assertEqual(out.brushes,[]);self.assertTrue(out.skipped)
 def test_portable123_full_positive_and_closed_scope_before_any_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   out,_=self.imported(tmp);env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/asset['file']).read_bytes()).decode()for aid,asset in out.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'positive');convert.portable_bundle(path,good);self.assertEqual(good.brushes,out.brushes)
   for case in['revision122','missingGray','rootGray','badRef','wrongSide','unequalAlpha','geometry','rootMask','rounding','rank','gradient','color','sampling','strength','dual','child','texture','erase','timer','cloneNull']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];tip=d['tip'];a=tip['animation'];m=tip['material']
    if case=='revision122':d['version']=122
    elif case=='missingGray':m['grayFrames'].pop()
    elif case=='rootGray':m['gray']=m['grayFrames'][1]
    elif case=='badRef':m['grayFrames'][1]='bad'
    elif case in('wrongSide','unequalAlpha'):
     raw=bytes(64);digest=hashlib.sha256(raw).hexdigest();aid='asset:'+digest;bad['assets'][aid]=base64.b64encode(raw).decode();bad['library']['assets'].append({'id':aid,'size':8,'file':digest+'.bin'})
     if case=='wrongSide':m['grayFrames'][1]=aid
     else:a['frames'][1]=aid
    elif case=='geometry':a['geometry']={'version':1,'frames':[{'sourceWidth':4,'sourceHeight':2,'maskBounds':tip['maskBounds']}for _ in a['frames']]}
    elif case=='rootMask':a['frames'][0]=m['grayFrames'][0]
    elif case=='rounding':a['roundingPolicy']='away-v1'
    elif case=='rank':a['rank']=1
    elif case=='gradient':m['kind']='gradient'
    elif case=='color':tip['color']={'planes':[m['gray']]*3,'frames':[[v]*3 for v in m['grayFrames']]}
    elif case=='sampling':tip['imageSampling']={}
    elif case=='strength':m['strength']=2
    elif case=='dual':d['behavior']['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);tip.pop('animation');tip.pop('material');d['behavior']['dual']={'brush':child,'blendMode':'normal'}
    elif case=='texture':d['texture']={}
    elif case=='erase':d['behavior']['erase']=True
    elif case=='timer':d['behavior']['timing']={}
    else:d['clone']=None
    path.write_text(json.dumps(bad));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{});self.assertEqual(list(dest.output.iterdir()),[])
