"""Authored native-format gradient/Wash; not a stock/genuine-beneficiary claim."""
import io,json,base64,copy,tempfile,unittest
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita,preset
from pixel_gradient_wash138 import pixel_gradient_wash138_scope
from test_krita import kpp

class PixelGradientWash138(unittest.TestCase):
 def authored(self,action='2',extra=''):
  raw=kpp('<Brush type="png_brush" filename="tip.png" brushApplication="3" AdjustmentVersion="2"/>',resources='<param name="PaintOpAction">'+action+'</param>'+extra)
  im=Image.new('RGBA',(2,2));im.putdata([(255,0,0,255),(0,255,0,128),(0,0,255,64),(255,255,255,0)]);b=io.BytesIO();im.save(b,format='PNG');return raw,{'tip.png':b.getvalue()}
 def native(self,root,action='2',extra=''):
  raw,assets=self.authored(action,extra);file=root/'Own.kpp';file.write_bytes(raw);c=convert.Catalog(root/'out');convert_krita(file,c,assets);return c,raw,assets
 def portable(self,library,payload):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);f=root/'p.json';f.write_text(json.dumps({'library':library,'assets':payload}));c=convert.Catalog(root/'out');convert.portable_bundle(f,c);return len(c.brushes)
 def fixture(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_,_=self.native(Path(tmp));self.assertEqual(c.skipped,[]);l=c.write();payload={a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in l['assets']};return l,payload
 def test_native_action2_promotes138_after_old_assignments_and_action1_keeps100(self):
  descriptors=[]
  for action,version in [('2',138),('1',100)]:
   with tempfile.TemporaryDirectory()as tmp:
    c,raw,_=self.native(Path(tmp),action);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);row=c.brushes[0];d=row['descriptor'];descriptors.append(d);self.assertEqual(d['version'],version);self.assertEqual(d['tip']['color']['gradient']['sampling'],'filteredGray-v1');self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken'if action=='2'else'directOver');self.assertEqual(pixel_gradient_wash138_scope(d),action=='2');self.assertEqual(len(c.assets),2);self.assertTrue(all(a['size']==2 for a in c.assets.values()));self.assertEqual(any(n['feature']=='pixelGradientWash'for n in row['compatibility']),action=='2')
  for k in ['tip','sizeByPressure','flowByPressure','opacityByPressure']:self.assertEqual(descriptors[0][k],descriptors[1][k])
  self.assertNotEqual(descriptors[0]['id'],descriptors[1]['id'])
 def test_portable_whole_positive_old_defaults_and_closed_negatives_before_outputs(self):
  l,payload=self.fixture();self.assertEqual(self.portable(l,payload),1)
  for version in [97,100,138]:
   old=copy.deepcopy(l);d=old['brushes'][0]['descriptor'];d['version']=version;d['behavior']['rendering']['accumulation']='directOver'
   if version==97:del d['tip']['color']['gradient']['sampling']
   self.assertEqual(self.portable(old,payload),1)
  for key in ['revision','sampling','missingSampling','timer','texture','scatter','erase','HSV','dual','child','animation','mixer','wet','edge','oversize','mismatch']:
   bad=copy.deepcopy(l);d=bad['brushes'][0]['descriptor'];b=d['behavior'];g=d['tip']['color']['gradient']
   if key=='revision':d['version']=137
   elif key=='sampling':g['sampling']='other'
   elif key=='missingSampling':g.pop('sampling')
   elif key=='timer':b['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
   elif key in ['texture','scatter','mixer','wet']:d[key]={}
   elif key=='erase':b['erase']=True
   elif key=='HSV':b['colorAdjustment']={}
   elif key=='dual':b['dual']={}
   elif key=='child':
    child=copy.deepcopy(d);d['tip']={'kind':'round','hardness':1,'aspect':1,'rotation':'fixed','angle':0};b['rendering']['accumulation']='directOver';b['dual']={'brush':child,'sampling':'independent','blendMode':'multiply'}
   elif key=='animation':d['tip']['animation']={'mode':'random','frames':[d['tip']['mask']]}
   elif key=='edge':b['rendering']['wetEdges']=.2
   elif key=='oversize':
    for a in bad['assets']:a['size']=1024
   else:bad['assets'][1]['size']=4
   with self.subTest(key=key),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);f=root/'p.json';f.write_text(json.dumps({'library':bad,'assets':payload}));c=convert.Catalog(root/'out')
    with self.assertRaises(ValueError):convert.portable_bundle(f,c)
    self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{})
 def test_native_timer_and_private_origin_cannot_acquire_new_scope(self):
  for key in ['PaintOpSettings/isAirbrushing','AirbrushOption/isAirbrushing']:
   with tempfile.TemporaryDirectory()as tmp:
    c,_,_=self.native(Path(tmp),extra='<param name="'+key+'">true</param>');self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped);self.assertEqual(c.assets,{})
  with tempfile.TemporaryDirectory()as tmp:
   raw,assets=self.authored();c=convert.Catalog(Path(tmp)/'out')
   with self.assertRaisesRegex(ValueError,'Wash138'):preset(raw,'Own.kpp',c,assets,_allow_texture_material=False)
