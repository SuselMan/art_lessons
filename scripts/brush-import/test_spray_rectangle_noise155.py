import copy,io,json,tempfile,unittest,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image,PngImagePlugin
from test_krita_spray import SprayTest
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle,validate_portable_profile
from spray_rectangle_noise155 import spray_rectangle_noise155_scope
class SprayRectangleNoise155(unittest.TestCase):
 def raw(self,kind='gaussian',extra=''):
  im=Image.open(io.BytesIO(SprayTest().make()));im.load();r=ET.fromstring(im.info['preset']);next(p for p in r.findall('param')if p.get('name')=='SprayShape/enabled').text='false'
  generator='<MaskGenerator id="gauss" diameter="32" ratio="0.5" type="rect" spikes="2" hfade="0.3" vfade="0.7" antialiasEdges="1"/>'if kind=='gaussian'else'<MaskGenerator id="soft" diameter="32" ratio="0.75" type="rect" spikes="2" softness_curve="0,0;0.5,0.8;1,1;" antialiasEdges="0"/>'
  ET.SubElement(r,'param',{'name':'brush_definition'}).text='<Brush type="auto_brush" density="0.5" randomness="0.4">'+generator+'</Brush>'
  for p in ET.fromstring('<r>'+extra+'</r>'):r.append(p)
  info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(r,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=info);return out.getvalue()
 def test_native155_whole_roundtrip_gaussian_curve_andbaseversion_not96(self):
  for kind,profile in [('gaussian','gaussian2D'),('curve','curveRectangle')]:
   with self.subTest(kind=kind),tempfile.TemporaryDirectory()as t:
    cat=Catalog(Path(t)/'native');b=preset(self.raw(kind),'own155.kpp',cat,{});cat.brushes.append(b);lib=cat.write();d=b['descriptor'];self.assertEqual(d['version'],155);self.assertEqual(d['tip']['profile']['kind'],profile);self.assertTrue(spray_rectangle_noise155_scope(d));self.assertEqual(d['tip']['autoNoise'],{'version':1,'density':.5,'randomness':.4});self.assertEqual(d['spray']['count'],12)
    env={'library':lib,'assets':{k:__import__('base64').b64encode((cat.output/a['file']).read_bytes()).decode()for k,a in cat.assets.items()}};p=Path(t)/'own.grafetto-brushes.json';p.write_text(json.dumps(env));out=Catalog(Path(t)/'portable');portable_bundle(p,out);self.assertEqual(out.brushes,cat.brushes);self.assertEqual(out.assets,cat.assets)
 def test_wrongrevision_andforbiddenfields_reject_beforeportableoutputs(self):
  with tempfile.TemporaryDirectory()as t:d=preset(self.raw(),'own.kpp',Catalog(Path(t)),{})['descriptor']
  edits=[lambda b:b.update(version=154),lambda b:b.update(version=156),lambda b:b['behavior'].update(erase=True),lambda b:b['behavior'].update(timing={}),lambda b:b['tip'].update(autoShape={'version':1,'spikes':3}),lambda b:b['spray']['color'].update(sampleInput=True),lambda b:b['spray']['particle'].update(image=True),lambda b:b.update(texture={}),lambda b:b['behavior']['rendering'].update(accumulation='alphaDarken')]
  for edit in edits:
   b=copy.deepcopy(d);edit(b);self.assertFalse(spray_rectangle_noise155_scope(b))
   with self.assertRaises(ValueError):validate_portable_profile(b)
 def test_nativeoutsideclosedstatic_scope_doesnotmislabel155(self):
  for extra in ['<param name="Krita/erase">true</param>','<param name="PaintOpAction">2</param>','<param name="ColorOption/sampleInputColor">true</param>']:
   with tempfile.TemporaryDirectory()as t:
    with self.assertRaises(ValueError):preset(self.raw(extra=extra),'bad.kpp',Catalog(Path(t)),{})
 def test_legacy96_nativebranch_unchanged(self):
  raw=self.raw();im=Image.open(io.BytesIO(raw));im.load();r=ET.fromstring(im.info['preset']);node=next(p for p in r if p.get('name')=='brush_definition');node.text='<Brush type="auto_brush" density="0.5" randomness="0.4"><MaskGenerator id="default" diameter="32" ratio="1" type="circle" spikes="2" hfade="1" vfade="1" antialiasEdges="0"/></Brush>';info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(r,encoding='unicode'));out=io.BytesIO();im.save(out,format='PNG',pnginfo=info)
  with tempfile.TemporaryDirectory()as t:b=preset(out.getvalue(),'old96.kpp',Catalog(Path(t)),{});self.assertEqual(b['descriptor']['version'],96);validate_portable_profile(b['descriptor'])
