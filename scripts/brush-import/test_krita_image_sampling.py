"""Authored inverse-gray source grids; no third-party brush pixels."""
import base64
import copy
import io
import json
import struct
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita, integer_image_sampling
from test_krita import kpp


def png(image):
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()


class IntegerImageSamplingTests(unittest.TestCase):
    def test_positive_gbr_bytes_recover_native_inverted_gray_after_loading(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'Authored.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="authored.gbr"/>'))
            # Native KisGbrBrush loads one-byte GBR as 255-byte indexed gray.
            # The CAS remains positive coverage; the shared policy recovers gray.
            source=struct.pack('>7I',29,2,4,1,1,0x47494d50,25)+b'\0'+bytes([0,64,128,255])
            catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'authored.gbr':source})
            self.assertEqual(catalog.skipped,[])
            tip=catalog.brushes[0]['descriptor']['tip'];self.assertIn('imageSampling',tip)
            rect=tip['imageSampling']['sourceRect'];asset=catalog.assets[tip['mask']]
            raw=(catalog.output/asset['file']).read_bytes();start=rect['y']*asset['size']+rect['x']
            self.assertEqual(raw[start:start+4],bytes([0,64,128,255]))

    def test_recovers_exact_odd_source_rectangle_without_changing_cas(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);image=Image.new('L',(3,5));image.putdata(range(15))
            path=root/'Authored.kpp';path.write_bytes(kpp('<Brush type="png_brush" filename="authored.png"/>'))
            catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'authored.png':png(image)})
            self.assertEqual(catalog.skipped,[])
            tip=catalog.brushes[0]['descriptor']['tip'];sampling=tip['imageSampling']
            self.assertEqual(sampling,{'kind':'integer-pyramid','signal':'inverse-gray','sourceRect':{'x':2,'y':1,'width':3,'height':5}})
            asset=catalog.assets[tip['mask']];raw=(catalog.output/asset['file']).read_bytes()
            cropped=bytes(raw[(y+1)*8+x+2]for y in range(5)for x in range(3))
            self.assertEqual(cropped,bytes(255-v for v in range(15)))
            self.assertEqual(catalog.brushes[0]['descriptor']['version'],27)

    def test_signal_requires_unmodified_opaque_gray_and_bounded_source(self):
        for image,application in [
            (Image.new('RGBA',(3,2),(0,0,0,254)),0),
            (Image.new('RGB',(3,2),(0,255,0)),0),
            (Image.new('L',(513,2),0),0),
            (Image.new('L',(3,2),0),2),
        ]:
            self.assertIsNone(integer_image_sampling(image,application,1024))
        for mode in ['L','LA','RGB','RGBA']:
            image=Image.new('L',(3,2),128).convert(mode)
            self.assertIsNotNone(integer_image_sampling(image,0,4))

    def test_portable_roundtrip_preserves_policy_and_rejects_untrusted_extents(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'Authored.kpp';path.write_bytes(kpp('<Brush type="png_brush" filename="authored.png"/>'))
            catalog=convert.Catalog(root/'source');convert_krita(path,catalog,{'authored.png':png(Image.new('L',(3,2),128))})
            manifest=catalog.write();bundle={'library':manifest,'assets':{key:base64.b64encode((catalog.output / value['file']).read_bytes()).decode()for key,value in catalog.assets.items()}}
            portable=root/'bundle.json';portable.write_text(json.dumps(bundle))
            target=convert.Catalog(root/'target');convert.portable_bundle(portable,target)
            self.assertEqual(target.brushes[0]['descriptor']['tip']['imageSampling'],manifest['brushes'][0]['descriptor']['tip']['imageSampling'])
            for patch in [
                {'sourceRect':{'x':3,'y':0,'width':3,'height':2}},
                {'sourceRect':{'x':.5,'y':0,'width':3,'height':2}},
                {'signal':'alpha'}, {'extra':True},
            ]:
                bad=copy.deepcopy(bundle);bad['library']['brushes'][0]['descriptor']['tip']['imageSampling'].update(patch)
                portable.write_text(json.dumps(bad))
                with self.assertRaises(ValueError):convert.portable_bundle(portable,convert.Catalog(root/'bad'))
