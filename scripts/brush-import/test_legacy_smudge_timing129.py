"""Self-authored small frames + exact stock control strings, not original stock artwork.
Original genuine Water-Pattern SHA4774ef...4b59 is separately CAPS-proven before refresh.
"""
import unittest,io,struct,tempfile,json,copy,hashlib,base64,zipfile
from pathlib import Path
from PIL import Image,PngImagePlugin
from brush_contract import Catalog
from krita_import import convert_krita,preset,DEFAULT_NATIVE_INPUT_POLICY
from convert import portable_bundle
from legacy_smudge_timing import legacy_smudge_timing_scope

def pipe():
 frames=[]
 for i in range(7):
  name=('own129-%s'%i).encode()+b'\0';pixels=bytes(255 if x==i%3 or y==(i//3)%3 else 0 for y in range(3)for x in range(3));frames.append(struct.pack('>7I',28+len(name),2,3,3,1,0x47494d50,25)+name+pixels)
 return b'Own129\n7 dim:1 ncells:7 rank0:7 sel0:random\n'+b''.join(frames)
def authored(extra=None):
 params={'CompositeOp':'normal','SmudgeRateMode':'0','SmudgeRateValue':'1','PressureSmudgeRate':'true','SmudgeRateSmearAlpha':'true','MergedPaint':'false','PressureColorRate':'true','ColorRateValue':'0','PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':'100.13','PaintOpSettings/ignoreSpacing':'false','PressureRate':'false','PressureRotation':'true','RotationUseCurve':'true','RotationValue':'1','RotationSensor':'<params id="fuzzy"><curve>0,0.346734;1,0.743719;</curve></params>','SizeUseCurve':'false','brush_definition':'<Brush type="gbr_brush" filename="own129.gih" brushApplication="0" scale="1" angle="0"/>'};params.update(extra or {});text='<Preset name="Own129" paintopid="colorsmudge">'+''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in params.items())+'</Preset>';png=PngImagePlugin.PngInfo();png.add_text('preset',text);b=io.BytesIO();Image.new('RGB',(2,2),'white').save(b,format='PNG',pnginfo=png);return b.getvalue()
def imported(root,extra=None,**flags):
 raw=authored(extra);bundle=root/'Own129.bundle';root.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(bundle,'w')as z:z.writestr('paintoppresets/Own129.kpp',raw);z.writestr('brushes/own129.gih',pipe())
 c=Catalog(root/'output');convert_krita(bundle,c,**flags);return c,raw
class LegacyTiming129(unittest.TestCase):
 def test_default_existingpolicy_genuine_option_controls_and_original_id(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,raw=imported(Path(tmp));self.assertEqual(len(c.brushes),1);self.assertFalse(c.skipped);b=c.brushes[0];d=b['descriptor'];self.assertEqual(d['version'],129);self.assertTrue(legacy_smudge_timing_scope(d));self.assertEqual(d['behavior']['timing'],{'version':1,'rate':100.13,'ignoreDistanceSpacing':False});self.assertEqual(len(d['tip']['animation']['frames']),7);self.assertEqual(d['tip']['animation']['mode'],'random');self.assertIn('grafettoSourceTime-v1',json.dumps(d['behavior']));seed={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(raw).hexdigest(),'rendering':{k:v for k,v in d.items()if k!='id'}};self.assertEqual(d['id'],'imported-'+hashlib.sha256(json.dumps(seed,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24])
 def test_explicit_false_and_private_legacy_remain_exact_default_preset(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c,raw=imported(root/'off',timed_input=False);legacy=preset(raw,'Own129.kpp',Catalog(root/'direct'),{'own129.gih':pipe()});self.assertEqual(c.brushes,[legacy]);self.assertNotIn('timing',legacy['descriptor']['behavior']);self.assertNotIn('grafettoSourceTime-v1',json.dumps(legacy))
 def test_foreign_modern_projection_rate_or_disabled_conditions_do_not_auto_enable(self):
  for extra in [{'MergedPaint':'true'},{'SmudgeRateUseNewEngine':'true'},{'PressureRate':'true'},{'PaintOpSettings/ignoreSpacing':'true'},{'PaintOpSettings/isAirbrushing':'false'},{'Pressureh':'true','hValue':'1','hUseCurve':'true','hSensor':'<params id="pressure"/>'},{'MaskingBrush/Enabled':'true','MaskingBrush/UseMasterSize':'true','MaskingBrush/MasterSizeCoeff':'1','MaskingBrush/MaskingCompositeOp':'multiply','MaskingBrush/Preset/brush_definition':'<Brush type="auto_brush"><MaskGenerator type="circle" diameter="20"/></Brush>','MaskingBrush/Preset/SizeUseCurve':'false'}]:
   with self.subTest(extra=extra),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);a,_=imported(root/'a',extra);b,_=imported(root/'b',extra,timed_input=False);self.assertEqual(a.brushes,b.brushes);self.assertEqual(a.skipped,b.skipped)
 def test_private_origin_full_record_identity_equals_explicit_legacy(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);raw=authored();resources={'own129.gih':pipe()};a=preset(raw,'Own129.kpp',Catalog(root/'a'),resources,_allow_texture_material=False,_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY);b=preset(raw,'Own129.kpp',Catalog(root/'b'),resources,_allow_texture_material=False,timed_input=False);self.assertEqual(a,b);self.assertNotIn('timing',a['descriptor']['behavior'])
 def test_portable_closed_scope_and_preoutput_rejections(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c,_=imported(root/'native');manifest=c.write();payload={'library':manifest,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in manifest['assets']}};f=root/'own.grafetto-brushes.json';f.write_text(json.dumps(payload));positive=Catalog(root/'positive');portable_bundle(f,positive);self.assertEqual(positive.brushes,c.brushes)
   for case in ['revision128','projection','modern','rateDynamics','ignoreSpacing','dualNull','cloneNull','tipColorNull','mixerRole','paper','wetEdges','burntEdges','renderMode','colorAdjustment','edgeBleed','grain','missingTiming']:
    bad=copy.deepcopy(payload);d=bad['library']['brushes'][0]['descriptor']
    if case=='revision128':d['version']=128
    elif case=='projection':d['mixer']['source']='projectionCanvas'
    elif case=='modern':d['mixer']['algorithm']='krita-mask'
    elif case=='rateDynamics':d['behavior']['timing']['rateDynamics']=[]
    elif case=='ignoreSpacing':d['behavior']['timing']['ignoreDistanceSpacing']=True
    elif case=='dualNull':d['behavior']['dual']=None
    elif case=='cloneNull':d['clone']=None
    elif case=='tipColorNull':d['tip']['color']=None
    elif case=='paper':d['paperInteraction']=.5
    elif case=='wetEdges':d['behavior']['rendering']['wetEdges']=.2
    elif case=='burntEdges':d['behavior']['rendering']['burntEdges']=.2
    elif case=='renderMode':d['behavior']['rendering']['mode']='uniformGlaze'
    elif case=='colorAdjustment':d['behavior']['colorAdjustment']={}
    elif case=='edgeBleed':d['behavior']['edgeBleed']=None
    elif case=='grain':d['behavior']['grain']=None
    elif case=='missingTiming':d['behavior'].pop('timing')
    elif case=='mixerRole':d['mixer']['pickupDynamics']=[{'control':'random','minimum':0,'jitter':0,'randomSource':{'kind':'grafettoSourceTime-v1','key':'mixer/pickup'}}]
    f.write_text(json.dumps(bad));negative=Catalog(root/case)
    with self.assertRaises(ValueError):portable_bundle(f,negative)
    self.assertEqual(negative.brushes,[]);self.assertEqual(negative.assets,{});self.assertFalse(list(negative.output.glob('*.bin')))
