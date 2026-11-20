import io,tempfile,unittest,json,base64,copy
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class LightnessStrengthTests(unittest.TestCase):
 def imported(self,tmp,settings,engine='paintbrush'):
  path=Path(tmp)/'Input.kpp';definition='<Brush type="png_brush" filename="tip.png" preserveLightness="1" AdjustmentVersion="2"/>';path.write_bytes(kpp(definition,resources=settings,engine=engine));out=io.BytesIO();Image.new('RGBA',(2,2),(100,140,180,128)).save(out,format='PNG');c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'tip.png':out.getvalue()});self.assertEqual(c.skipped,[]);self.catalog=c;return c.brushes[0]
 def test_unchecked_saved_value_and_curve_are_ignored(self):
  with tempfile.TemporaryDirectory()as tmp:
   b=self.imported(tmp,'<param name="PressureLightnessStrength">false</param><param name="LightnessStrengthValue">.2</param>');d=b['descriptor'];self.assertEqual(d['tip']['material']['strength'],1);self.assertNotIn('lightnessStrength',d.get('behavior',{}).get('modulations',{}));self.assertLess(d['version'],90)
 def test_checked_constant_remains_static_without_revision_change(self):
  with tempfile.TemporaryDirectory()as tmp:
   d=self.imported(tmp,'<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthUseCurve">false</param><param name="LightnessStrengthValue">.2</param>')['descriptor'];self.assertEqual(d['tip']['material']['strength'],.2);self.assertNotIn('lightnessStrength',d.get('behavior',{}).get('modulations',{}));self.assertLess(d['version'],90)
 def test_checked_curve_flat_pointfive_retains_base_once(self):
  with tempfile.TemporaryDirectory()as tmp:
   d=self.imported(tmp,'<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthValue">.2</param><param name="LightnessStrengthSensor"><![CDATA[<params id="pressure"><curve>0,.5;1,.5;</curve></params>]]></param>')['descriptor'];self.assertEqual(d['version'],90);self.assertEqual(d['tip']['material']['strength'],.2);self.assertEqual(set(d['behavior']['modulations']['lightnessStrength'][0]['curve']['samples']),{.5})
 def test_compound_constant_keeps_outer_base_for_normalized_response(self):
  with tempfile.TemporaryDirectory()as tmp:
   d=self.imported(tmp,'<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthValue">.25</param><param name="LightnessStrengthcurveMode">1</param><param name="LightnessStrengthSensor"><![CDATA[<params id="sensorslist"><ChildSensor id="pressure"/><ChildSensor id="declination"/></params>]]></param>')['descriptor'];self.assertEqual(d['version'],90);self.assertEqual(d['tip']['material']['strength'],.25);self.assertEqual(d['behavior']['modulations']['lightnessStrength'][0]['combine']['constant'],.25)
 def test_color_smudge_keeps_native_projection_strength_one(self):
  with tempfile.TemporaryDirectory()as tmp:
   d=self.imported(tmp,'<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthValue">.2</param>','colorsmudge')['descriptor'];self.assertEqual(d['tip']['material']['strength'],1);self.assertNotIn('lightnessStrength',d['behavior'].get('modulations',{}))

 def test_masking_child_target_propagates_parent_revision(self):
  with tempfile.TemporaryDirectory()as tmp:
   settings='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="png_brush" filename="tip.png" preserveLightness="1" AdjustmentVersion="2"/>]]></param><param name="MaskingBrush/Preset/PressureLightnessStrength">true</param><param name="MaskingBrush/Preset/LightnessStrengthValue">.5</param>'
   d=self.imported(tmp,settings)['descriptor'];self.assertEqual(d['version'],90);child=d['behavior']['dual']['brush'];self.assertEqual(child['version'],90);self.assertEqual(child['tip']['material']['strength'],.5);self.assertIn('lightnessStrength',child['behavior']['modulations'])

 def test_portable_target_roundtrip_validates_complete_cas_before_writes(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);self.imported(tmp,'<param name="PressureLightnessStrength">true</param><param name="LightnessStrengthValue">.2</param>');c=self.catalog;library=c.write();payload={'library':library,'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode() for aid,a in c.assets.items()}};path=root/'valid.grafetto-brushes.json';path.write_text(json.dumps(payload));target=convert.Catalog(root/'valid');convert.portable_bundle(path,target);self.assertEqual(target.brushes[0]['descriptor'],library['brushes'][0]['descriptor'])
   for i,mutation in enumerate(['oldRevision','mixer','noMaterial','badCurve','unknownField','clone']):
    bad=copy.deepcopy(payload);d=bad['library']['brushes'][0]['descriptor']
    if mutation=='oldRevision':d['version']=89
    elif mutation=='mixer':d['model']='mixer'
    elif mutation=='noMaterial':del d['tip']['material']
    elif mutation=='clone':d['clone']={'version':1,'moveSourcePoint':True}
    elif mutation=='badCurve':d['behavior']['modulations']['lightnessStrength'][0]['curve']={'kind':'unknown','samples':[0,1]}
    else:d['behavior']['modulations']['lightnessStrength'][0]['unknown']=1
    path=root/f'bad{i}.grafetto-brushes.json';path.write_text(json.dumps(bad));target=convert.Catalog(root/f'bad{i}')
    with self.subTest(mutation=mutation):
     with self.assertRaises(ValueError):convert.portable_bundle(path,target)
     self.assertEqual(list(target.output.iterdir()),[])
if __name__=='__main__':unittest.main()
