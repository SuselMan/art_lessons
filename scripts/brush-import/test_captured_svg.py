import io
import json
import base64
import copy
import hashlib
import tempfile
import zipfile
import unittest
from pathlib import Path
from unittest import mock
from captured_svg import captured_svg,sanitize_svg,MAX_INPUT

SVG=b'<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2" viewBox="0 0 4 2"><rect width="2" height="2" fill="#ff0000"/></svg>'

def stock_records(case, root):
 from brush_contract import Catalog
 from convert import portable_bundle
 fixtures=Path(__file__).parent/'fixtures'
 historical_bytes=(fixtures/'svg_stock_fallback.json').read_bytes()
 historical=json.loads(historical_bytes)
 expected=json.loads((fixtures/'svg_stock_793d_expected.json').read_text())
 raw=base64.b64decode(historical['sourceKppBase64'])
 resource=base64.b64decode(historical['resourcePngBase64'])
 case.assertEqual(hashlib.sha256(historical_bytes).hexdigest(),'336fb03b9a878ddd48f82585bc1c6f137be276833611a48002449b81a334baa0')
 case.assertEqual(hashlib.sha256(raw).hexdigest(),'2d9d66f34a3f8d0b93a739478ce35d79ec9716c4bad859d04d5d51096b11feb7')
 case.assertEqual(hashlib.sha256(resource).hexdigest(),'a93c17028d894827813ce3f52be4c7f70b5e33571bd9e51ca8fd2975ef03a1a9')
 case.assertEqual(expected['historicFixtureSha256'],hashlib.sha256(historical_bytes).hexdigest())
 case.assertEqual(expected['sourceKppSha256'],hashlib.sha256(raw).hexdigest())
 case.assertEqual(expected['resourcePngSha256'],hashlib.sha256(resource).hexdigest())
 old=historical['descriptor']; new=expected['record']['descriptor']
 case.assertEqual(old['id'],'imported-f638a148129d80e986fa5ccc')
 case.assertEqual(new['id'],'imported-c8cbb622f65163be5b48b529')
 def reference_id(d):
  seed={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(raw).hexdigest(),'rendering':{k:v for k,v in d.items() if k!='id'}}
  return 'imported-'+hashlib.sha256(json.dumps(seed,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24]
 case.assertEqual(reference_id(old),old['id']);case.assertEqual(reference_id(new),new['id'])
 updated=copy.deepcopy(old);updated['opacityByPressure']=[[0,0],[1,1]];updated['flowByPressure']=[[0,0],[1,1]];updated['id']=new['id']
 case.assertEqual(updated,new)
 old_record=copy.deepcopy(expected['record']);old_record['descriptor']=copy.deepcopy(old);old_record['compatibility']=copy.deepcopy(historical['compatibility']);old_record['warnings']=[n['feature']+': '+n['detail'] for n in historical['compatibility'] if n['status']!='supported']
 portable=root/'historical.grafetto-brushes.json';portable.write_text(json.dumps({'library':{'schemaVersion':1,'brushes':[old_record],'assets':expected['assets'],'skipped':[]},'assets':expected['assetDataBase64']}))
 restored=Catalog(root/'historical');portable_bundle(portable,restored)
 case.assertEqual(restored.brushes,[old_record]);case.assertEqual(list(restored.assets.values()),expected['assets'])
 for asset in expected['assets']:
  data=(restored.output/asset['file']).read_bytes();case.assertEqual(hashlib.sha256(data).hexdigest(),asset['id'][6:]);case.assertEqual(base64.b64encode(data).decode(),expected['assetDataBase64'][asset['id']])
 for payload in ({},{expected['assets'][0]['id']:base64.b64encode(b'bad!').decode()}):
  portable.write_text(json.dumps({'library':{'schemaVersion':1,'brushes':[old_record],'assets':expected['assets'],'skipped':[]},'assets':payload}))
  with case.assertRaises(ValueError):portable_bundle(portable,Catalog(root/('invalid-'+str(len(payload)))))
 return historical, expected, raw, resource

class CapturedSvgTests(unittest.TestCase):
 def test_rgba_image_preserves_size_color_transparency(self):
  im=captured_svg(SVG,'captured-image-v1');self.assertEqual(im.size,(4,2));self.assertEqual(im.getpixel((0,0)),(255,0,0,255));self.assertEqual(im.getpixel((3,0)),(0,0,0,0))
 def test_native_mask_policy_white_gray1000(self):
  im=captured_svg(SVG,'krita-mask-v1');self.assertEqual(im.size,(1000,500));r,g,b,a=im.getpixel((100,100));self.assertEqual((r,g),(g,b));self.assertEqual(a,255);self.assertEqual(im.getpixel((900,100)),(255,255,255,255))
 def test_local_gradient_clip_and_style(self):
  data=b'<svg width="4" height="2"><defs><linearGradient id="a"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><linearGradient id="b" href="#a"/><clipPath id="c"><rect width="2" height="2"/></clipPath></defs><rect width="4" height="2" style="fill:url(#b);clip-path:url(#c)"/></svg>'
  im=captured_svg(data,'captured-image-v1');self.assertEqual(im.getpixel((3,0))[3],0);self.assertEqual(im.getpixel((0,0))[3],255)
 def test_xml_declaration(self):self.assertEqual(sanitize_svg(b'<?xml version="1.0"?>'+SVG,'captured-image-v1')[1],(4,2))
 def test_dangerous_inputs_never_spawn_decoder(self):
  bad=[b'<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///etc/passwd">]>'+SVG,SVG.replace(b'<rect',b'<script'),SVG.replace(b'<rect',b'<image href="file:///etc/passwd"'),SVG.replace(b'<rect',b'<text'),SVG.replace(b'<rect',b'<foreignObject'),SVG.replace(b'<rect',b'<use href="#a"'),SVG.replace(b'fill="#ff0000"',b'fill="url(https://x)"'),SVG.replace(b'fill="#ff0000"',b'style="font-family:serif"'),SVG.replace(b'fill="#ff0000"',b'fill="u\\72l(file:///x)"'),SVG.replace(b'<rect',b'<filter'),SVG.decode().encode('utf-16')]
  with mock.patch('captured_svg.subprocess.run',side_effect=AssertionError('unsafe spawn')):
   for data in bad:
    with self.subTest(data=data[:40]),self.assertRaises(ValueError):captured_svg(data,'captured-image-v1')
 def test_cycles_and_unknown_local_refs(self):
  for defs in [b'<linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>',b'<linearGradient id="a" href="#absent"/>']:
   with self.assertRaises(ValueError):sanitize_svg(b'<svg width="2" height="2"><defs>'+defs+b'</defs></svg>','captured-image-v1')
 def test_bounds_before_decoder(self):
  cases=[SVG+b' '*(MAX_INPUT+1),SVG.replace(b'width="4"',b'width="9000"'),b'<svg width="4096" height="4096"/>',b'<svg width="2" height="2">'+b'<g/>'*4096+b'</svg>',SVG.replace(b'viewBox="0 0 4 2"',b'viewBox="0 0 0 2"')]
  for data in cases:
   with self.subTest(length=len(data)),self.assertRaises(ValueError):sanitize_svg(data,'captured-image-v1')
 def test_native_zero_height_is_rejected(self):
  with self.assertRaises(ValueError):sanitize_svg(b'<svg viewBox="0 0 1000000 1"/>','krita-mask-v1')
 def test_sanitizer_rejects_namespace_base_and_duplicate_id(self):
  for data in [SVG.replace(b'<rect',b'<rect xml:base="file:///x"'),b'<svg width="2" height="2"><g id="a"/><g id="a"/></svg>']:
   with self.assertRaises(ValueError):sanitize_svg(data,'captured-image-v1')
 def test_selfcontained_historical_stock_descriptor_and_notes(self):
  from krita_import import convert_krita
  from brush_contract import Catalog
  with tempfile.TemporaryDirectory()as tmp:
   fixture,expected,raw,resource=stock_records(self,Path(tmp));catalog=Catalog(Path(tmp)/'new')
   path=Path(tmp)/'stock-fixture.kpp';path.write_bytes(raw);convert_krita(path,catalog,{'own.svg':resource})
   self.assertEqual(catalog.skipped,[]);self.assertEqual(catalog.brushes,[expected['record']]);self.assertEqual(list(catalog.assets.values()),expected['assets'])
   for asset in expected['assets']:self.assertEqual(base64.b64encode((catalog.output/asset['file']).read_bytes()).decode(),expected['assetDataBase64'][asset['id']])
 def test_stock_prepared_png_path_does_not_invoke_new_decoder(self):
  from PIL import Image
  from krita_import import raster
  out=io.BytesIO();Image.new('RGB',(2,2),'white').save(out,format='PNG')
  with mock.patch('captured_svg.captured_svg',side_effect=AssertionError('stock fallback changed')):
   self.assertEqual(raster(out.getvalue(),'stock.svg',svg_policy='krita-mask-v1').size,(2,2))
 def test_long_ids_and_hex_colors_are_not_numeric_coordinates(self):
  im=captured_svg(b'<svg width="2" height="2"><defs><linearGradient id="gradient123456789"><stop offset="0" stop-color="#12345678"/></linearGradient></defs><rect width="2" height="2" fill="url(#gradient123456789)"/></svg>','captured-image-v1')
  self.assertEqual(im.size,(2,2));self.assertGreater(im.getpixel((0,0))[3],0)
 def test_longest_dag_path_checks_reused_short_first_subtree(self):
  # c is visited first via defs (short route), but later referenced after a
  # 60-node gradient href chain. Memoizing done-only misses total depth>64.
  defs=b'<linearGradient id="c"><stop/></linearGradient>'+b''.join(('<linearGradient id="g%d" href="#%s"/>'%(i,'c'if i==0 else'g%d'%(i-1))).encode()for i in range(63))
  with self.assertRaisesRegex(ValueError,'deep'):sanitize_svg(b'<svg width="2" height="2"><defs>'+defs+b'</defs><rect width="2" height="2" fill="url(#g62)"/></svg>','captured-image-v1')
 def test_bom_comment_metadata_and_editor_attributes_preserve_path(self):
  data=b'\xef\xbb\xbf<?xml version="1.0"?><!-- artist notes --><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="2" height="2" inkscape:version="1.4"><title>Own artist brush</title><desc>Notes</desc><metadata><anything href="file:///not-rendered"/></metadata><path sodipodi:nodetypes="cccc" d="M0 0H2V2H0Z" fill="red"/></svg>'
  im=captured_svg(data,'captured-image-v1');self.assertEqual(im.getpixel((0,0)),(255,0,0,255))
 def test_mask_viewbox_native_policy_and_image_viewport_are_distinct(self):
  data=b'<svg width="20" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
  self.assertEqual(sanitize_svg(data,'krita-mask-v1')[1],(1000,1000))
  self.assertEqual(sanitize_svg(data,'captured-image-v1')[1],(20,10))
  with self.assertRaises(ValueError):sanitize_svg(data.replace(b'20',b'20%'),'krita-mask-v1')
 def test_comment_cannot_hide_doctype_or_malformed_delimiters(self):
  for data in [b'<!--bad--comment-->'+SVG,b'<!--open'+SVG,b'<!--ok--><!DOCTYPE svg>'+SVG]:
   with self.assertRaises(ValueError):sanitize_svg(data,'captured-image-v1')
 def test_genuine_bundle_captured_svg_member_reaches_real_decoder(self):
  from PIL import Image,PngImagePlugin
  from brush_contract import Catalog
  from krita_import import convert_krita
  xml='<Preset paintopid="paintbrush" name="Own bundled SVG"><param name="brush_definition">&lt;Brush type="svg_brush" filename="own.svg" scale="1" ratio="1"/&gt;</param></Preset>'
  info=PngImagePlugin.PngInfo();info.add_text('preset',xml);stream=io.BytesIO();Image.new('RGBA',(2,2)).save(stream,format='PNG',pnginfo=info)
  with tempfile.TemporaryDirectory()as tmp:
   path=Path(tmp)/'own.bundle'
   with zipfile.ZipFile(path,'w')as archive:archive.writestr('paintoppresets/own.kpp',stream.getvalue());archive.writestr('brushes/own.svg',SVG)
   c=Catalog(Path(tmp)/'out');convert_krita(path,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);self.assertNotIn('color',c.brushes[0]['descriptor']['tip']);self.assertGreater(len(c.assets),0)
 def test_bundle_preserves_explicit_prepared_stock_override_exactly(self):
  from brush_contract import Catalog
  from krita_import import convert_krita
  with tempfile.TemporaryDirectory()as tmp:
   fixture,expected,raw,resource=stock_records(self,Path(tmp))
   path=Path(tmp)/'own.bundle'
   with zipfile.ZipFile(path,'w')as archive:archive.writestr('stock-fixture.kpp',raw);archive.writestr('brushes/own.svg',SVG)
   c=Catalog(Path(tmp)/'out');convert_krita(path,c,{'operator.bundle/brushes/own.svg':resource});self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes,[expected['record']]);self.assertEqual(list(c.assets.values()),expected['assets'])
   for asset in expected['assets']:self.assertEqual(base64.b64encode((c.output/asset['file']).read_bytes()).decode(),expected['assetDataBase64'][asset['id']])
 def test_genuine_embedded_svg_resource_not_external_loader(self):
  import hashlib
  from PIL import Image,PngImagePlugin
  from brush_contract import Catalog
  from krita_import import preset
  import xml.etree.ElementTree as ET
  root=ET.Element('Preset',{'paintopid':'paintbrush','name':'Own embedded SVG'});ET.SubElement(root,'param',{'name':'brush_definition'}).text='<Brush type="svg_brush" filename="own.svg" scale="1" ratio="1"/>';ET.SubElement(ET.SubElement(root,'resources'),'resource',{'filename':'own.svg','md5sum':hashlib.md5(SVG).hexdigest()}).text=base64.b64encode(SVG).decode()
  info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));stream=io.BytesIO();Image.new('RGBA',(2,2)).save(stream,format='PNG',pnginfo=info)
  with tempfile.TemporaryDirectory()as tmp:
   record=preset(stream.getvalue(),'own.kpp',Catalog(Path(tmp)),{});self.assertIn('mask',record['descriptor']['tip']);self.assertNotIn('color',record['descriptor']['tip'])
 def test_decoder_timeout_is_explicit_recoverable_import_error(self):
  import subprocess
  with mock.patch('captured_svg.subprocess.run',side_effect=subprocess.TimeoutExpired('node',20)):
   with self.assertRaisesRegex(ValueError,'timed out'):captured_svg(SVG,'captured-image-v1')
 def test_explicit_policy_required(self):
  with self.assertRaises(ValueError):sanitize_svg(SVG,'automatic')
 def test_spray_captured_svg_reuses_existing_rgba_cas(self):
  import xml.etree.ElementTree as ET
  from krita_spray_image import capture_spray_image
  root=ET.Element('Preset');definition,size=capture_spray_image(root,'particle.svg',lambda name:SVG);self.assertEqual(size,(4,2));self.assertEqual(ET.fromstring(definition).get('brushApplication'),'1');self.assertEqual(len(root.find('resources')),1)
 def test_svg_brush_integration_is_mask_not_color(self):
  import base64
  from PIL import Image,PngImagePlugin
  from brush_contract import Catalog
  from krita_import import preset
  xml='<Preset paintopid="paintbrush" name="Own SVG"><param name="brush_definition">&lt;Brush type="svg_brush" filename="own.svg" scale="1" ratio="1" brushApplication="1"/&gt;</param></Preset>'
  info=PngImagePlugin.PngInfo();info.add_text('preset',xml);data=io.BytesIO();Image.new('RGBA',(2,2)).save(data,format='PNG',pnginfo=info)
  with tempfile.TemporaryDirectory()as tmp:
   d=preset(data.getvalue(),'own.kpp',Catalog(Path(tmp)),{'own.svg':SVG})['descriptor'];self.assertNotIn('color',d['tip']);self.assertIn('mask',d['tip'])
if __name__=='__main__':unittest.main()
