import base64
import hashlib
import io
import json
import math
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock
from PIL import Image, PngImagePlugin
from brush_contract import Catalog
from krita_import import preset


def encoded(image):
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()


def kpp(reference='particle.png', *, embedded=None, md5=None, extra=None, shape=4):
    root=ET.Element('Preset',{'paintopid':'spraybrush','name':'Own image shape fixture'})
    params={'PaintOpAction':'1','Spray/diameter':'100','Spray/scale':'1','Spray/particleCount':'1','SprayShape/enabled':'true','SprayShape/shape':str(shape),'SprayShape/width':'9','SprayShape/height':'3','SprayShape/imageUrl':reference}
    params.update(extra or {})
    for key,value in params.items():ET.SubElement(root,'param',{'name':key}).text=value
    if embedded is not None:
        resources=ET.SubElement(root,'resources')
        ET.SubElement(resources,'resource',{'filename':'particle.png','md5sum':md5 or hashlib.md5(embedded).hexdigest()}).text=base64.b64encode(embedded).decode()
    info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();Image.new('RGBA',(2,2),'red').save(out,format='PNG',pnginfo=info);return out.getvalue()


def read_original(catalog,descriptor):
    tip=descriptor['tip'];ids=[*tip['color']['planes'],tip['mask']];side=catalog.assets[ids[0]]['size'];b=tip['maskBounds'];x,y,w,h=[round(b[k]*side)for k in('x','y','width','height')]
    planes=[]
    for aid in ids:
        asset=catalog.assets[aid];raw=(catalog.output/asset['file']).read_bytes();image=Image.frombytes('L',(asset['size'],asset['size']),raw);planes.append(list(image.crop((x,y,x+w,y+h)).getdata()))
    return(w,h),list(zip(*planes))


class SprayImageImportTest(unittest.TestCase):
    def test_embedded_rgba_retains_asymmetric_pixels_alpha_and_tight_crop(self):
        image=Image.new('RGBA',(4,2));pixels=[(255,0,0,255),(0,255,0,128),(0,0,255,0),(10,20,30,64),(1,2,3,255),(40,50,60,192),(70,80,90,32),(100,110,120,1)];image.putdata(pixels)
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));r=preset(kpp(embedded=encoded(image)),'own.kpp',c,{})
            d=r['descriptor'];self.assertEqual(d['version'],76);self.assertEqual(d['spray']['particle'],{'shape':'tip','image':True,'width':9,'height':3,'proportional':False});self.assertEqual(d['tip']['aspect'],1)
            self.assertEqual(read_original(c,d),((4,2),pixels));self.assertEqual(d['tip']['maskBounds'],{'x':0,'y':.25,'width':1,'height':.5});self.assertEqual(r['sourceDefaults']['sizePx'],100)
            self.assertTrue(any(n['feature']=='sprayImageParticle'and n['status']=='approximate'for n in r['compatibility']))

    def test_opaque_grayscale_is_rgba_not_inverted_coverage(self):
        image=Image.new('L',(1,3));image.putdata([0,128,255])
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));r=preset(kpp(embedded=encoded(image)),'gray.kpp',c,{})
            self.assertEqual(read_original(c,r['descriptor']),((1,3),[(0,0,0,255),(128,128,128,255),(255,255,255,255)]))

    def test_resolves_external_captured_bytes_by_existing_portable_basename(self):
        image=Image.new('RGBA',(3,2),(20,80,160,100));payload=encoded(image)
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));r=preset(kpp('/artist/private/particle.png'),'external.kpp',c,{'bundle/particle.png':payload});self.assertEqual(read_original(c,r['descriptor'])[0],(3,2))

    def test_existing_host_image_is_not_opened(self):
        with tempfile.TemporaryDirectory()as tmp:
            file=Path(tmp)/'particle.png';file.write_bytes(encoded(Image.new('RGBA',(2,2),'red')));open_image=Image.open
            with mock.patch.object(Image,'open',wraps=open_image)as opened:
                with self.assertRaisesRegex(ValueError,'Missing Krita resource'):preset(kpp(str(file)),'no-host.kpp',Catalog(Path(tmp)/'out'),{})
                self.assertTrue(all(isinstance(call.args[0],io.BytesIO)for call in opened.call_args_list))

    def test_remote_reference_is_not_fetched_without_captured_resource(self):
        with tempfile.TemporaryDirectory()as tmp:
            with self.assertRaisesRegex(ValueError,'Missing Krita resource'):preset(kpp('https://example.invalid/particle.png'),'no-net.kpp',Catalog(Path(tmp)),{})

    def test_ambiguous_portable_resources_and_bad_checksum_reject(self):
        a=encoded(Image.new('RGBA',(2,2),'red'));b=encoded(Image.new('RGBA',(2,2),'blue'))
        with tempfile.TemporaryDirectory()as tmp:
            with self.assertRaisesRegex(ValueError,'Ambiguous Krita resource'):preset(kpp(),'ambiguous.kpp',Catalog(Path(tmp)),{'a/particle.png':a,'b/particle.png':b})
            result=preset(kpp(embedded=a,md5='0'*32),'checksum.kpp',Catalog(Path(tmp)),{})
            self.assertTrue(any(n['feature']=='resourceChecksum' for n in result['compatibility']))

    def test_geometry_rotation_and_request_scale_are_not_baked_into_source(self):
        payload=encoded(Image.new('RGBA',(4,2),'red'))
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp));d=preset(kpp(embedded=payload,extra={'Spray/scale':'2','SprayShape/proportional':'true','ShapeDynamicsVersion':'1','ShapeDynamics/enabled':'true','ShapeDynamics/fixedRotation':'true','ShapeDynamics/fixedAngle':'90','ShapeDynamics/randomSize':'true'}),'geometry.kpp',c,{})['descriptor']
            self.assertEqual((d['spray']['particle']['width'],d['spray']['particle']['height']),(9,3));self.assertTrue(d['spray']['particle']['proportional']);self.assertEqual(d['spray']['scale'],2);self.assertAlmostEqual(d['spray']['dynamics']['fixedAngle'],math.pi/2);self.assertTrue(d['spray']['dynamics']['randomSize']);self.assertEqual(read_original(c,d)[0],(4,2))

    def test_source_flags_never_opt_image_into_native_original87(self):
        payload=encoded(Image.new('RGBA',(2,2),'red'))
        with tempfile.TemporaryDirectory()as tmp:
            r=preset(kpp(embedded=payload,extra={'ColorOption/sampleInputColor':'true','ColorOption/mixBgColor':'true','ColorOption/fillBackground':'true'}),'flags.kpp',Catalog(Path(tmp)),{});d=r['descriptor'];self.assertFalse(any(n['feature']=='spraySourceTiming'for n in r['compatibility']));self.assertEqual(d['version'],76);self.assertNotIn('sourcePolicy',d['spray']['color']);self.assertTrue(d['spray']['particle']['image'])

    def test_erase_image_is_rejected_before_advertising_a_renderer_combination(self):
        payload=encoded(Image.new('RGBA',(2,2),'red'))
        with tempfile.TemporaryDirectory()as tmp:
            with self.assertRaisesRegex(ValueError,'image shape combination'):preset(kpp(embedded=payload,extra={'CompositeOp':'erase'}),'erase.kpp',Catalog(Path(tmp)),{})

    def test_captured_pixel_content_changes_real_render_identity_and_missing_does_not_fallback_to_thumbnail(self):
        data=kpp();ids=[]
        for color in ['red','blue']:
            with tempfile.TemporaryDirectory()as tmp:
                d=preset(data,'same-source.kpp',Catalog(Path(tmp)),{'particle.png':encoded(Image.new('RGBA',(2,2),color))})['descriptor'];ids.append(d['id'])
        self.assertNotEqual(ids[0],ids[1])
        with tempfile.TemporaryDirectory()as tmp:
            catalog=Catalog(Path(tmp))
            with self.assertRaisesRegex(ValueError,'Missing Krita resource'):preset(data,'thumbnail-only.kpp',catalog,{})
            self.assertEqual(catalog.assets,{})

    def test_nonimage_spray_is_exact_legacy_descriptor(self):
        fixture=json.loads((Path(__file__).parent/'fixtures/spray_image4_legacy.json').read_text())
        data=base64.b64decode(fixture['sourceKppBase64'],validate=True)
        self.assertEqual(hashlib.sha256(data).hexdigest(),fixture['sourceSha256'])
        with tempfile.TemporaryDirectory()as tmp:
            with self.assertRaisesRegex(ValueError, 'Implicit Krita Wash'):
                preset(data,'legacy.kpp',Catalog(Path(tmp)/'public'),{})
            # The historic adapter record remains unchanged for existing replay;
            # the public importer now refuses to create it from implicit Wash.
            from krita_spray import spray_preset
            image=Image.open(io.BytesIO(data));root=ET.fromstring(image.info['preset'])
            params={node.get('name'):node.text or '' for node in root.findall('param')}
            actual=spray_preset(data,root,params,'legacy.kpp',Catalog(Path(tmp)/'legacy'),{})
        for key in ('descriptor','compatibility'):
            self.assertEqual(actual[key],fixture[key])
            canonical=json.dumps(actual[key],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
            self.assertEqual(hashlib.sha256(canonical).hexdigest(),fixture[key+'Sha256'])

if __name__=='__main__':unittest.main()
