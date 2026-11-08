import unittest,tempfile,json,copy,base64,io,hashlib
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from stroke_input import independent_drawing_angle_pair,validate_policy
from test_krita_size_strength import authored
POLICY={'version':1,'initialDirection':'cursorHistory'}
FIXTURE=json.loads((Path(__file__).parent/'fixtures/child_lightness128_rake_controls.json').read_text())
def params128():
 p=copy.deepcopy(FIXTURE['params']);p['brush_definition']='<Brush type="png_brush" filename="ownroot.png" scale="1.03279" preserveLightness="1" ColorAsMask="1" BrightnessAdjustment=".04" ContrastAdjustment=".01" AdjustmentMidPoint="127" BrushVersion="2" spacing=".03"/>';p['MaskingBrush/Preset/brush_definition']='<Brush type="png_brush" filename="ownchild.png" scale=".817656" preserveLightness="0" ColorAsMask="0" BrightnessAdjustment="0" ContrastAdjustment="0" BrushVersion="2" spacing=".04"/>';return p
def resources128():
 def png(w,h,data):
  o=io.BytesIO();Image.frombytes('RGBA',(w,h),bytes(data)).save(o,format='PNG');return o.getvalue()
 root=png(4,8,[v for y in range(8)for x in range(4)for v in(x*85,x*85,x*85,255 if y<6 else 128)]);child=png(4,4,[v for y in range(4)for x in range(4)for v in(0 if x==0 or y==3 else 255,)*3+(255,)]);return{'ownroot.png':root,'ownchild.png':child}
class ChildLightness128(unittest.TestCase):
 def imported(self,tmp,edit=None):
  p=params128();p.update(edit or{});raw=authored(p);path=Path(tmp)/'Own128.kpp';path.write_bytes(raw);c=convert.Catalog(Path(tmp)/'native');convert_krita(path,c,resources128());return c,raw
 def test_native_rake_option_mechanisms_default_API_both128_and_original_identity(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,raw=self.imported(tmp);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush'];self.assertEqual(d['version'],128);self.assertEqual(child['version'],128);self.assertTrue(independent_drawing_angle_pair(d));self.assertEqual(d['behavior']['strokeInput'],POLICY);self.assertEqual(child['behavior']['strokeInput'],POLICY);self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');self.assertEqual(child['behavior']['rendering']['accumulation'],'alphaDarken');self.assertEqual(d['behavior']['dual']['blendMode'],'darken');self.assertEqual(d['tip']['material']['kind'],'lightness');self.assertNotIn('grayFrames',d['tip']['material']);self.assertEqual(child['tip']['imageSampling']['signal'],'inverse-gray');self.assertEqual(child['tip']['imageSampling']['sourceRect']['width'],4);self.assertEqual(child['sizeByPressure'][0][1],1.6612698412698412);self.assertEqual(d['sizeByPressure']['samples'][0],.279006);self.assertEqual(d['flowByPressure']['samples'][0],0);self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id']);validate_policy(child,1,d)
   with self.assertRaises(ValueError):validate_policy(child,1,None)
   self.assertTrue(any(n['feature']=='masking.strokeInput'and n['status']=='supported'for n in c.brushes[0].get('compatibility',[]))or not any('Independent child input law is not executed'in w for w in c.brushes[0]['warnings']))
 def test_wrong_wholepair_never_emits_fake128_child_policy(self):
  for patch in[{'PressureRotation':'false'},{'MaskingBrush/Preset/RotationSensor':'<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="30"/>'},{'PressureScatter':'true','ScatterValue':'.2'}]:
   with self.subTest(patch=patch),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,patch);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertLess(d['version'],128);self.assertNotIn('strokeInput',d['behavior']['dual']['brush']['behavior'])
 def test_portable128_parentproof_pair_sizes_policies_and_scope_fail_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp);payload={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(payload));good=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(path,good);self.assertEqual(good.brushes,c.brushes)
   for case in['missingBounds','root127','child127','rootpolicy','inline','rootOver','childOver','graySide','grayCount','childRect','childMaterial','animation','fan','erase','texture','over512']:
    env=copy.deepcopy(payload);d=env['library']['brushes'][0]['descriptor'];child=d['behavior']['dual']['brush'];t=d['tip']
    if case=='missingBounds':t.pop('maskBounds')
    elif case=='root127':d['version']=127
    elif case=='child127':child['version']=127
    elif case=='rootpolicy':d['behavior'].pop('strokeInput')
    elif case=='inline':d['behavior']['dual']['sampling']='inline'
    elif case=='rootOver':d['behavior']['rendering']['accumulation']='directOver'
    elif case=='childOver':child['behavior']['rendering']['accumulation']='directOver'
    elif case=='graySide':t['material']['gray']=child['tip']['mask']
    elif case=='grayCount':t['material']['grayFrames']=[t['material']['gray']]
    elif case=='childRect':child['tip']['imageSampling']['sourceRect']['width']=2
    elif case=='childMaterial':child['tip']['material']=copy.deepcopy(t['material'])
    elif case=='animation':t['animation']={'mode':'incremental','frames':[t['mask']]*2}
    elif case=='fan':child['behavior']['strokeInput']['fanCorners']={'stepDegrees':30}
    elif case=='erase':d['behavior']['erase']=True
    elif case=='texture':d['texture']={}
    else:
     raw=bytes(1024*1024);hash=hashlib.sha256(raw).hexdigest();aid='asset:'+hash;env['assets'][aid]=base64.b64encode(raw).decode();env['library']['assets'].append({'id':aid,'size':1024,'file':hash+'.bin'});t['material']['gray']=aid
    path.write_text(json.dumps(env));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
    self.assertEqual(list(dest.output.iterdir()),[])
