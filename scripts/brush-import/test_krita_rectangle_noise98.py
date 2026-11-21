import tempfile,unittest,copy,json,base64
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
class RectangleNoiseTests(unittest.TestCase):
 def brush(self,generator='gauss',shape='rect',dynamic=False,density=.5,randomness=1):
  definition=f'<Brush type="auto_brush" density="{density}" randomness="{randomness}"><MaskGenerator id="{generator}" type="{shape}" ratio=".6" diameter="40" spikes="2" antialiasEdges="1" hfade=".4" vfade=".8" softness_curve="0,0;0.5,1;1,0;"/></Brush>'
  extra='<param name="PressureSoftness">true</param><param name="SoftnessValue">.7</param><param name="SoftnessUseCurve">false</param>'if dynamic else''
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);p=root/'Authored98.kpp';p.write_bytes(kpp(definition,resources=extra));c=convert.Catalog(root/'out');convert_krita(p,c);self.assertEqual(c.skipped,[])
   library=c.write();payload={a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in library['assets']};return library,payload
 def test_genuine_profiles_controls_and_old_versions(self):
  for generator,shape,dynamic,kind in[('gauss','rect',False,'gaussian2D'),('gauss','circle',False,'gaussian2D'),('soft','rect',False,'curveRectangle'),('soft','rect',True,'curveRectangleSoftness')]:
   lib,payload=self.brush(generator,shape,dynamic);d=lib['brushes'][0]['descriptor'];self.assertEqual(d['version'],98);self.assertEqual(d['tip']['profile']['kind'],kind);self.assertEqual(d['tip']['autoNoise'],{'version':1,'density':.5,'randomness':1});convert.validate_portable_profile(d)
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);path=root/'portable.json';path.write_text(json.dumps({'library':lib,'assets':payload}));out=convert.Catalog(root/'portable');convert.portable_bundle(path,out);self.assertEqual(len(out.brushes),1)
   if dynamic:self.assertAlmostEqual(d['behavior']['softness'],.7)
   for version in(74,78,79,80,97):
    bad=copy.deepcopy(d);bad['version']=version
    with self.assertRaises(ValueError):convert.validate_portable_profile(bad)
 def test_portable_root_only_and_density_endpoints(self):
  for density in(0,1):
   lib,payload=self.brush(density=density);d=lib['brushes'][0]['descriptor'];self.assertEqual(d['tip']['autoNoise']['density'],density)
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);path=root/'portable.json';path.write_text(json.dumps({'library':lib,'assets':payload}));out=convert.Catalog(root/'good');convert.portable_bundle(path,out);self.assertEqual(len(out.brushes),1)
    parent=copy.deepcopy(d);parent['tip']={'kind':'round','hardness':1,'aspect':1,'angle':0,'rotation':'fixed'};parent['behavior']['dual']={'brush':copy.deepcopy(d),'blendMode':'multiply'};lib['brushes'][0]['descriptor']=parent;path.write_text(json.dumps({'library':lib,'assets':payload}))
    with self.assertRaisesRegex(ValueError,'root-only'):convert.portable_bundle(path,convert.Catalog(root/'bad'))
 def test_neutral_noise_keeps_historical_profile_version(self):
  for generator,shape,version in[('gauss','rect',78),('gauss','circle',78),('soft','rect',79)]:
   lib,_=self.brush(generator,shape,density=1,randomness=0);d=lib['brushes'][0]['descriptor'];self.assertEqual(d['version'],version);self.assertNotIn('autoNoise',d['tip'])
 def test_noise_revision_survives_recorded_drawing_angle(self):
  definition='<Brush type="auto_brush" density=".15" randomness=".5"><MaskGenerator id="gauss" type="rect" ratio=".55" diameter="40" spikes="2" antialiasEdges="0" hfade=".94" vfade=".67"/></Brush>'
  extra='<param name="PressureRotation">true</param><param name="RotationValue">1</param><param name="RotationUseCurve">true</param><param name="RotationUseSameCurve">true</param><param name="RotationSensor">&lt;params id="drawingangle" fanCornersStep="5" angleOffset="0" fanCornersEnabled="1" lockedAngleMode="0"&gt;&lt;curve&gt;0,0;0.630522,0.445415;1,1;&lt;/curve&gt;&lt;/params&gt;</param>'
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);p=root/'brush.kpp';p.write_bytes(kpp(definition,resources=extra));c=convert.Catalog(root/'out');convert_krita(p,c)
   self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor']
   self.assertIn('strokeInput',d['behavior']);self.assertEqual(d['version'],98);convert.validate_portable_profile(d)
