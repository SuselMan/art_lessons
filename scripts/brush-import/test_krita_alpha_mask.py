"""Authored witnesses only; no vendor artwork or runtime/catalog mutation."""
import io
from pathlib import Path
import struct
import tempfile
import unittest
import xml.etree.ElementTree as ET
from PIL import Image
import convert
from krita_import import raster,gbr,brush_application,convert_krita
from test_krita import kpp


def png(image):
    stream=io.BytesIO();image.save(stream,format='PNG');return stream.getvalue()


def rgba_gbr(pixels):
    return struct.pack('>7I',29,2,len(pixels)//4,1,4,0x47494d50,25)+b'\0'+pixels


class AlphaMaskTests(unittest.TestCase):
    def test_opaque_channel_presence_does_not_erase_native_luminance(self):
        for mode,values in [('L',[0,255,128,64]),('LA',[(0,255),(255,255),(128,255),(64,255)]),('RGB',[(0,0,0),(255,255,255),(128,128,128),(64,64,64)]),('RGBA',[(0,0,0,255),(255,255,255,255),(128,128,128,255),(64,64,64,255)])]:
            image=Image.new(mode,(2,2));image.putdata(values)
            self.assertEqual(raster(png(image),'authored.png',True).tobytes(),bytes([255,0,127,191]))
    def test_partial_alpha_palette_and_qgray_integer_weights(self):
        image=Image.new('RGBA',(4,1));image.putdata([(0,0,0,128),(128,128,128,128),(255,0,0,255),(0,0,255,255)])
        self.assertEqual(raster(png(image),'authored.png',True).tobytes(),bytes([128,64,168,216]))
        palette=Image.new('P',(2,1));palette.putpalette([0,0,0,255,255,255]+[0]*762);palette.putdata([0,1]);palette.info['transparency']=bytes([128,255])
        self.assertEqual(raster(png(palette),'palette.png',True).tobytes(),bytes([128,0]))
    def test_positive_gbr_is_not_inverted_and_forced_rgba_mask_retains_gray(self):
        positive=struct.pack('>7I',29,2,4,1,1,0x47494d50,25)+b'\0'+bytes([0,64,128,255])
        self.assertEqual(raster(positive,'positive.gbr',True).tobytes(),bytes([0,64,128,255]))
        rgba=rgba_gbr(bytes([0,0,0,255,255,255,255,255,128,128,128,128]))
        self.assertEqual(gbr(rgba).tobytes(),bytes([255,255,128]))
        self.assertEqual(raster(rgba,'rgba.gbr',True).tobytes(),bytes([255,0,64]))
    def test_application_uses_native_legacy_precedence(self):
        colored=Image.new('RGBA',(1,1),(20,50,90,255));gray=Image.new('RGBA',(1,1),(50,50,50,255))
        cases=[({},colored,1),({},gray,0),({'ColorAsMask':'1'},colored,0),({'ColorAsMask':'0'},colored,1),({'ColorAsMask':'0'},gray,0),({'brushApplication':'3'},colored,3),({'preserveLightness':'1','brushApplication':'0','ColorAsMask':'1'},gray,2),({'preserveLightness':'0','brushApplication':'2','ColorAsMask':'1'},colored,0)]
        for attrs,image,expected in cases:
            self.assertEqual(brush_application(ET.Element('Brush',attrs),[image]),expected)
    def test_gih_applies_mask_semantics_to_every_rgba_frame(self):
        pipe=b'Authored\n2 dim:1 rank0:2 sel0:incremental\n'+rgba_gbr(bytes([255,255,255,255]))+rgba_gbr(bytes([0,0,0,255]))
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'QA.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gih" ColorAsMask="1"/>'))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog,{'tip.gih':pipe})
            brush=catalog.brushes[0];frames=brush['descriptor']['tip']['animation']['frames']
            self.assertNotEqual(frames[0],frames[1])
            self.assertEqual((catalog.output/catalog.assets[frames[0]]['file']).read_bytes(),bytes(4))
            self.assertEqual((catalog.output/catalog.assets[frames[1]]['file']).read_bytes(),bytes([255,0,0,0]))
            self.assertFalse(any(note['feature']=='gihColour' for note in brush['compatibility']))
    def test_legacy_lightness_is_explicitly_unsupported_without_changing_to_mask(self):
        image=Image.new('RGBA',(2,2),(255,255,255,128))
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'QA.kpp';path.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" preserveLightness="1" ColorAsMask="1"/>'))
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog,{'tip.png':png(image)})
            brush=catalog.brushes[0]
            self.assertEqual(brush['source'],'QA.kpp')
            self.assertEqual(brush['name'],'QA Krita')
            self.assertTrue(any(note['feature']=='brushApplication' and note['status']=='unsupported' and 'LIGHTNESSMAP' in note['detail'] for note in brush['compatibility']))
            aid=brush['descriptor']['tip']['mask'];raw=(catalog.output/catalog.assets[aid]['file']).read_bytes()
            self.assertEqual(raw,bytes([128])*4)
