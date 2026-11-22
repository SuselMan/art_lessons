"""Authored native-format derivatives; genuine original retained for future CAPS."""
from pathlib import Path
import io,json,copy,tempfile,unittest,struct,base64
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita
from convert import portable_bundle
from tangent_wash136 import tangent_wash136_scope
PARAMS=json.loads((Path(__file__).parent/'fixtures/tangent_wash136_controls.json').read_text())['params']
def authored(action='2',extra=None):
 root=ET.Element('Preset',{'name':'Own Tangent136 derivative','paintopid':'tangentnormal'})
 for k,v in{**PARAMS,'PaintOpAction':action,**(extra or{})}.items():ET.SubElement(root,'param',{'name':k}).text=v
 info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));b=io.BytesIO();Image.new('RGB',(2,2),'red').save(b,format='PNG',pnginfo=info);return b.getvalue()
class TangentWash136(unittest.TestCase):
 def test_point_sharpness_wash_uses_version209(self):
  definition='<Brush type="auto_brush" spacing="0.1"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1" spikes="2" diameter="1" id="default" antialiasEdges="0"/></Brush>'
  with tempfile.TemporaryDirectory() as tmp:
   c,_=self.native(tmp,extra={'brush_definition':definition,'PressureSize':'false','PressureSharpness':'true','SharpnessValue':'1','SharpnessUseCurve':'false','Sharpness/threshold':'1'})
   d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],209);self.assertTrue(tangent_wash136_scope(d));self.assertTrue(d['tangentNormal']['sharpnessChecked'])
   path=Path(tmp)/'portable.json';path.write_text(json.dumps({'library':c.write(),'assets':{}}));out=Catalog(Path(tmp)/'roundtrip');portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
   d=copy.deepcopy(d);d['version']=136;self.assertFalse(tangent_wash136_scope(d))
 def test_bitmap_wash_uses_version207_and_original_mask(self):
  name=b'own\0';gbr=struct.pack('>7I',28+len(name),2,4,4,1,0x47494d50,25)+name+bytes(range(16))
  definition='<Brush type="gbr_brush" filename="own.gbr" ColorAsMask="1" scale="1"/>'
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'Own.kpp';p.write_bytes(authored(extra={'brush_definition':definition}));c=Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gbr':gbr})
   self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],207);self.assertEqual(d['tip']['imageSampling']['kind'],'integer-pyramid');self.assertTrue(tangent_wash136_scope(d))
   payload={key:base64.b64encode((c.output/asset['file']).read_bytes()).decode()for key,asset in c.assets.items()};path=Path(tmp)/'portable.json';path.write_text(json.dumps({'library':c.write(),'assets':payload}))
   out=Catalog(Path(tmp)/'roundtrip');portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
 def test_elliptical_wash_uses_version206(self):
  definition=PARAMS['brush_definition'].replace('ratio="1"','ratio=".47"')
  with tempfile.TemporaryDirectory() as tmp:
   c,_=self.native(tmp,extra={'brush_definition':definition});d=c.brushes[0]['descriptor']
   self.assertEqual(d['version'],206);self.assertGreater(d['tip']['aspect'],1);self.assertTrue(tangent_wash136_scope(d))
   from convert import validate_portable_profile
   validate_portable_profile(d);bad=copy.deepcopy(d);bad['version']=136
   with self.assertRaises(ValueError):validate_portable_profile(bad)
   path=Path(tmp)/'portable.json';path.write_text(json.dumps({'library':c.write(),'assets':{}}));out=Catalog(Path(tmp)/'roundtrip');portable_bundle(path,out);self.assertEqual(out.brushes,c.brushes)
 def native(self,tmp,action='2',extra=None):
  raw=authored(action,extra);file=Path(tmp)/'Own.kpp';file.write_bytes(raw);c=Catalog(Path(tmp)/'native');convert_krita(file,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);return c,raw
 def test_new136_ignores_native_unusedFlow_while_old56_preserves_its_archived_law(self):
  rows=[]
  for action,version,law in[('2',136,'alphaDarken'),('1',56,'directOver')]:
   with tempfile.TemporaryDirectory()as tmp:
    c,raw=self.native(tmp,action);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['behavior']['rendering']['accumulation'],law);self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);self.assertEqual(tangent_wash136_scope(d),action=='2');self.assertEqual(c.assets,{});rows.append(d)
    self.assertEqual(any(n['feature']=='ignoredNativeFlow'and n['status']=='supported'for n in c.brushes[0]['compatibility']),action=='2')
  for k in('tip','tangentNormal','sizeByPressure','opacityByPressure'):self.assertEqual(rows[0][k],rows[1][k])
  self.assertEqual(rows[0]['flowByPressure'],[[0,1],[1,1]]);self.assertEqual(rows[1]['flowByPressure'],[[0,0],[1,1]])
 def test_newWash_does_not_parse_unused_malformedFlowSensor(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp,extra={'FlowSensor':'bad unused XML'});self.assertTrue(tangent_wash136_scope(c.brushes[0]['descriptor']))
 def test_portable_whole_closed_root_negatives_beforeoutputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{}};file=Path(tmp)/'Own.grafetto-brushes.json';file.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(file,good);self.assertEqual(good.brushes,c.brushes)
   for case in('revision','twist','directionArray','scatter','count','timer','child','dual','HSV','flow','flowCurve','bitmap','shape','wet','erase','sharpness'):
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];b=d['behavior']
    if case=='revision':d['version']=135
    elif case=='twist':d['tangentNormal']['direction']='rotation'
    elif case=='directionArray':d['tangentNormal']['direction']=['tilt']
    elif case in('scatter','count'):d['scatter']={'count':2,'radius':.5 if case=='scatter'else 0,'scale':1,'sizeJitter':0,'angleJitter':0,'flowJitter':0}
    elif case=='timer':b['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif case=='child':
     kid=copy.deepcopy(d);d.pop('tangentNormal');d['version']=27;b['rendering']['accumulation']='directOver';b['dual']={'brush':kid,'sampling':'independent','blendMode':'subtract'}
    elif case=='dual':b['dual']={}
    elif case=='HSV':b['colorAdjustment']={}
    elif case=='flow':d['flow']=.5
    elif case=='flowCurve':d['flowByPressure']=[[0,0],[1,1]]
    elif case=='bitmap':d['tip']['kind']='bitmap'
    elif case=='shape':d['tip']['profile']['shape']='rectangle'
    elif case=='wet':b['rendering']['wetEdges']=.1
    elif case=='erase':b['erase']=True
    else:d['tip']['alphaThreshold']={'value':.5,'softness':0}
    file.write_text(json.dumps(e));bad=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(file,bad)
    self.assertEqual(bad.brushes,[]);self.assertEqual(bad.assets,{});self.assertEqual(list(bad.output.iterdir()),[])
 def test_native_outside_closed_branch_has_no_published_outputs(self):
  for extra in[{'Tangent/directionType':'2'},{'PaintOpSettings/isAirbrushing':'true'},{'AirbrushOption/isAirbrushing':'true'},{'Krita/erase':'true'}]:
   with tempfile.TemporaryDirectory()as tmp:
    file=Path(tmp)/'Own.kpp';file.write_bytes(authored(extra=extra));c=Catalog(Path(tmp)/'bad');convert_krita(file,c);self.assertTrue(c.skipped);self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{})
