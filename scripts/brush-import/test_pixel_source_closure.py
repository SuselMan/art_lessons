"""Authored resource regressions; no vendor artwork or installed font dependency."""
import io
import hashlib
import zipfile
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock
from PIL import Image
import convert
from krita_import import convert_krita
from krita_abr import resolve_abr_tip
from test_krita import kpp


def frame(w,h,value):
    return struct.pack('>7I',29,2,w,h,1,0x47494d50,25)+b'\0'+bytes([value])*(w*h)


def abr(name,w=2,h=1,pixels=b'\x00\xff',tail=b''):
    encoded=(name+'\0').encode('utf-16-be')
    body=b'\0'*4+struct.pack('>HI',25,len(encoded)//2)+encoded+b'\0'*9+struct.pack('>4iHB',0,0,h,w,8,0)+pixels+tail
    return struct.pack('>HHHI',2,1,2,len(body))+body


class PixelSourceClosureTests(unittest.TestCase):
    def test_declared_bundle_manifest_bytes_preserve_original_rgba_planes(self):
        from krita_import import retain_declared_patterns
        pat=struct.pack('>6I',24,1,1,1,4,0x47504154)+bytes([17,83,211,49])
        manifest=('<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:file-entry manifest:media-type="patterns" manifest:full-path="patterns/authored.pat" manifest:md5sum="'+hashlib.md5(pat).hexdigest()+'"/></manifest:manifest>').encode()
        bundle=io.BytesIO()
        with zipfile.ZipFile(bundle,'w') as z:
            z.writestr('META-INF/manifest.xml',manifest);z.writestr('patterns/authored.pat',pat)
        with tempfile.TemporaryDirectory() as tmp,zipfile.ZipFile(io.BytesIO(bundle.getvalue())) as z:
            c=convert.Catalog(Path(tmp)/'out');retain_declared_patterns(z,z.namelist(),c)
            self.assertEqual(c.skipped,[]);self.assertEqual(len(c.patterns),1)
            r=c.patterns[0]['resource']
            self.assertEqual((r['width'],r['height'],r['periodX'],r['periodY']),(1,1,1,1))
            for aid,value in zip([*r['channels'],r['alphaAsset']],[17,83,211,49]):
                self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes([value,0,0,0]))
        oversized=Mock();oversized.getinfo.return_value.file_size=2**30
        with self.assertRaises(ValueError):retain_declared_patterns(oversized,['META-INF/manifest.xml'],Mock())
        oversized.read.assert_not_called()

    def test_unequal_gih_keeps_each_original_grid_and_parent_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'authored.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="tip.gih" scale="2"/>'))
            c=convert.Catalog(Path(tmp)/'out')
            convert_krita(p,c,{'tip.gih':b'Authored\n2 dim:1 rank0:2 sel0:incremental\n'+frame(3,2,64)+frame(1,5,192)})
            self.assertEqual(c.skipped,[])
            b=c.brushes[0];a=b['descriptor']['tip']['animation']
            self.assertEqual(b['sourceDefaults']['sizePx'],6)
            # GBR one-channel samples already carry positive coverage, unlike PNG inverse-gray.
            for i,(w,h,value) in enumerate([(3,2,64),(1,5,192)]):
                asset=c.assets[a['frames'][i]];r=a['frameBounds'][i];side=asset['size']
                self.assertEqual((r['width']*side,r['height']*side),(w,h))
                raw=(c.output/asset['file']).read_bytes()
                self.assertEqual(sum(x!=0 for x in raw),w*h)
                self.assertEqual(set(raw)-{0},{value})

    def test_gradient_map_opaque_alpha_channel_retains_gray_and_alpha(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'authored.kpp';p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="3" AdjustmentVersion="2"/>'))
            image=Image.new('RGBA',(3,2),(91,91,91,255));buf=io.BytesIO();image.save(buf,format='PNG')
            c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'tip.png':buf.getvalue()})
            self.assertEqual(c.skipped,[]);tip=c.brushes[0]['descriptor']['tip']
            self.assertEqual(tip['material']['kind'],'gradient');self.assertNotIn('strength',tip['material'])
            for aid,expected in [(tip['mask'],255),(tip['material']['gray'],91)]:
                raw=(c.output/c.assets[aid]['file']).read_bytes()
                self.assertEqual([v for v in raw if v],[expected]*6)

    def test_abr_legacy_selector_preserves_slash_unicode_and_ampersand(self):
        name='folder/Ink & \u0416'
        image,proof=resolve_abr_tip({'filename':name},{'declared.abr':abr(name)})
        self.assertEqual(image.size,(2,1));self.assertEqual(image.tobytes(),b'\xff\x00')
        self.assertEqual(proof['sampleName'],name);self.assertEqual(proof['sampleOrdinal'],1)
        with self.assertRaises(ValueError):resolve_abr_tip({'filename':'Ink & \u0416'},{'declared.abr':abr(name)})

    def test_selected_abr_trailing_and_oversized_header_reject_before_image(self):
        with self.assertRaisesRegex(ValueError,'trailing'):
            resolve_abr_tip({'filename':'Ink'},{'declared.abr':abr('Ink',tail=b'x')})
        with patch('krita_abr.Image.frombytes') as allocate:
            with self.assertRaises(ValueError):
                resolve_abr_tip({'filename':'Ink'},{'declared.abr':abr('Ink',2048,1024,b'')})
            allocate.assert_not_called()

    def test_svg_external_reference_and_reference_cycle_never_launch_renderer(self):
        from general_svg import rasterize_svg
        bodies=['<rect width="1" height="1" fill="url(https://example.invalid/a)"/>',
                '<g id="a" clip-path="url(#b)"><clipPath id="b" clip-path="url(#a)"/></g>']
        with patch('general_svg.subprocess.Popen') as launch:
            for body in bodies:
                with self.subTest(body=body),self.assertRaises(ValueError):
                    rasterize_svg(('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2">'+body+'</svg>').encode())
            launch.assert_not_called()

    def test_text_pipe_uses_utf16_units_and_unpadded_child_metrics(self):
        from krita_text import render_text_source
        with tempfile.TemporaryDirectory() as tmp:
            fontdir=Path(tmp)/'.fonts';fontdir.mkdir();f=fontdir/'authored.ttf';f.write_bytes(b'authored-font-placeholder')
            resolver=SimpleNamespace(stdout=(str(f)+'\n0\nAuthored\nRegular\n').encode(),stderr=b'')
            font=Mock();font.getbbox.side_effect=lambda s,**kw:(-1,-2,2 if s=='A' else 4,3)
            with patch('krita_text.Path.home',return_value=Path(tmp)),patch('krita_text.subprocess.run',return_value=resolver),patch('krita_text.features.check_feature',return_value=True),patch('krita_text.ImageFont.truetype',return_value=font),patch('krita_text.ImageDraw.Draw'):
                images,proof,sequence=render_text_source({'pipe':'true','text':'A\U0001f600A','font':'Authored,12'})
            self.assertEqual(sequence,[0,1,2,0]);self.assertEqual([i.size for i in images],[(3,5),(5,5),(5,5)])
            self.assertEqual([call.args[0] for call in font.getbbox.call_args_list],['A','\ufffd','\ufffd'])
            self.assertEqual(proof['family'],'Authored');self.assertFalse(proof['substituted'])
