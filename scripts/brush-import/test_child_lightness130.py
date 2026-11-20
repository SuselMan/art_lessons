"""Functional Impasto pair mechanisms; authored artwork, exact original active option strings."""
import unittest,tempfile,json,copy,base64,io,struct,hashlib
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita,preset
from brush_contract import finalize_identity
from stroke_input import independent_drawing_angle_pair,validate_independent_pair_assets
from test_krita_size_strength import authored
FIXTURE=json.loads((Path(__file__).parent/'fixtures/child_lightness130_impasto_controls.json').read_text())
def params130():
 p=copy.deepcopy(FIXTURE['params']);p['brush_definition']='<Brush type="gbr_brush" filename="ownroot.gih" scale="1.27567" angle="1.5708" preserveLightness="1" ColorAsMask="1" BrightnessAdjustment=".05" ContrastAdjustment="-.29" AdjustmentMidPoint="109" BrushVersion="2" useAutoSpacing="1" autoSpacingCoeff="1"/>';p['MaskingBrush/Preset/brush_definition']='<Brush type="gbr_brush" filename="ownchild.gih" scale=".711567" preserveLightness="0" ColorAsMask="0" BrushVersion="2" useAutoSpacing="1" autoSpacingCoeff=".56"/>';p['Texture/Pattern/PatternFileName']='ownpattern.png';p['Texture/Pattern/Scale']='1';p['Texture/Pattern/OffsetX']='1';p['Texture/Pattern/OffsetY']='2';return p
def gbr(w,h,ch,raw):
 name=b'Own\0';return struct.pack('>5I',28+len(name),2,w,h,ch)+b'GIMP'+struct.pack('>I',10)+name+bytes(raw)
def resources130(child_count=7,root_count=5):
 root=[gbr(4,8,4,[v for y in range(8)for x in range(4)for v in((i*23+x*40)%256,)*3+(255 if y<6 else 128,)])for i in range(root_count)];child=[gbr(4,4,1,[255 if x==i%4 or y==3 else 0 for y in range(4)for x in range(4)])for i in range(child_count)];o=io.BytesIO();Image.frombytes('L',(4,4),bytes(range(0,256,16))).save(o,format='PNG');return{'ownroot.gih':('OwnRoot\n%d ncells:%d dim:1 rank0:%d sel0:random\n'%(root_count,root_count,root_count)).encode()+b''.join(root),'ownchild.gih':('OwnChild\n%d ncells:%d dim:1 rank0:%d sel0:random\n'%(child_count,child_count,child_count)).encode()+b''.join(child),'ownpattern.png':o.getvalue()}
class ChildLightness130(unittest.TestCase):
 def imported(self,tmp,patch=None,resources=None):
  p=params130();p.update(patch or{});raw=authored(p);path=Path(tmp)/'Own130.kpp';path.write_bytes(raw);c=convert.Catalog(Path(tmp)/'native');convert_krita(path,c,resources or resources130());return c,raw
 def test_genuine_controls_default_API_preserve_root_effects_and_independent_random7_image_child(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,raw=self.imported(tmp);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];ch=d['behavior']['dual']['brush'];self.assertEqual((d['version'],ch['version']),(130,130));self.assertTrue(independent_drawing_angle_pair(d));validate_independent_pair_assets(d,{k:a['size']for k,a in c.assets.items()});self.assertEqual(len(d['tip']['animation']['frames']),5);self.assertEqual(len(d['tip']['material']['grayFrames']),5);self.assertEqual(len(ch['tip']['animation']['frames']),7);self.assertEqual(ch['tip']['imageSampling']['sourceRect'],{'x':0,'y':0,'width':4,'height':4});self.assertEqual(ch['behavior']['strokeInput'],{'version':1,'initialDirection':'cursorHistory'});self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');self.assertEqual(d['behavior']['dual']['blendMode'],'multiply');self.assertEqual(d['scatter']['radius'],.51);self.assertEqual(d['behavior']['scatter']['placement'],'xyUniform');self.assertIn('hue',d['behavior']['colorAdjustment']);self.assertIn('value',d['behavior']['colorAdjustment']);self.assertIn('size',d['behavior']['modulations']);self.assertEqual(d['texture']['application'],{'mode':'subtract','soft':False});self.assertEqual(ch['sizeByPressure'][0][1],.940106575064958);self.assertNotIn('scatter',ch);self.assertNotIn('mirror',ch['behavior']);self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id']);self.assertFalse(any(n['feature']=='masking.strokeInput'and n['status']=='unsupported'for n in c.brushes[0]['compatibility']))
   # L GBR bytes encode positive coverage; preserve literal source and square padding.
   for i,aid in enumerate(ch['tip']['animation']['frames']):self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes(255 if x==i%4 or y==3 else 0 for y in range(4)for x in range(4)))
 def test_no_blanket_GIH_sampling_or_fake_child_policy_for_ineligible_parent_or_private_origin(self):
  for patch in[{'PressureRotation':'false'},{'MaskingBrush/Preset/PressureRotation':'false'},{'MaskingBrush/Preset/PressureScatter':'true'},{'MaskingBrush/Preset/PressureMirror':'true'}]:
   with self.subTest(patch=patch),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,patch);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];ch=d['behavior']['dual']['brush'];self.assertLess(d['version'],130);self.assertNotIn('strokeInput',ch['behavior']);self.assertNotIn('imageSampling',ch['tip'])
  with tempfile.TemporaryDirectory()as tmp:
   c=convert.Catalog(Path(tmp)/'private');d=preset(authored(params130()),'private.kpp',c,resources130(),_allow_texture_material=False)['descriptor'];self.assertNotIn('strokeInput',d['behavior']['dual']['brush']['behavior']);self.assertNotIn('imageSampling',d['behavior']['dual']['brush']['tip'])
  with tempfile.TemporaryDirectory()as tmp:
   p=params130();p['MaskingBrush/Enabled']='false';path=Path(tmp)/'root.kpp';path.write_bytes(authored(p));c=convert.Catalog(Path(tmp)/'root');convert_krita(path,c,resources130());self.assertNotIn('imageSampling',c.brushes[0]['descriptor']['tip'])
 def test_generic3root4child_default_API_same_mechanism_and_no_blanket_root_annotation(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,resources=resources130(4,3));self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];ch=d['behavior']['dual']['brush'];self.assertEqual((d['version'],ch['version']),(130,130));self.assertEqual(len(d['tip']['animation']['frames']),3);self.assertEqual(len(d['tip']['material']['grayFrames']),3);self.assertEqual(len(ch['tip']['animation']['frames']),4);self.assertTrue(independent_drawing_angle_pair(d));validate_independent_pair_assets(d,{aid:a['size']for aid,a in c.assets.items()})
 def test_portable130_full_parent_metadata_and_all_frame_dimensions_fail_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp);payload={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(payload));good=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(path,good);self.assertEqual(good.brushes,c.brushes)
   for case in['root129','child129','grayCount','rootCount','lastGraySide','lastChildSide','missingBounds','rect','rootPolicy','inline','rootOver','childScatter','childMirror','fan']:
    env=copy.deepcopy(payload);d=env['library']['brushes'][0]['descriptor'];ch=d['behavior']['dual']['brush'];t=d['tip']
    if case=='root129':d['version']=129
    elif case=='child129':ch['version']=129
    elif case=='grayCount':t['material']['grayFrames'].pop()
    elif case=='rootCount':t['animation']['frames'].pop()
    elif case=='lastGraySide':t['material']['grayFrames'][-1]=ch['tip']['mask']
    elif case=='lastChildSide':ch['tip']['animation']['frames'][-1]=t['mask']
    elif case=='missingBounds':t.pop('maskBounds')
    elif case=='rect':ch['tip']['imageSampling']['sourceRect']['width']=3
    elif case=='rootPolicy':d['behavior'].pop('strokeInput')
    elif case=='inline':d['behavior']['dual']['sampling']='inline'
    elif case=='rootOver':d['behavior']['rendering']['accumulation']='directOver'
    elif case=='childScatter':ch['scatter']=copy.deepcopy(d['scatter'])
    elif case=='childMirror':ch['behavior']['mirror']={'horizontal':True,'vertical':True,'value':1}
    else:ch['behavior']['strokeInput']['fanCorners']={'stepDegrees':30}
    path.write_text(json.dumps(env));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
    self.assertEqual(list(dest.output.iterdir()),[])
if __name__=='__main__':unittest.main()
