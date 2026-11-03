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

    def test_svg_local_instances_masks_and_gradient_inheritance(self):
        from general_svg import sanitize_svg
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 2 2"><defs><linearGradient id="a"><stop offset="0" stop-color="black"/></linearGradient><linearGradient id="b" xlink:href="#a"/><symbol id="tip" viewBox="0 0 2 2"><rect width="2" height="2" fill="url(#b)"/></symbol><mask id="m"><circle cx="1" cy="1" r="1" fill="white"/></mask></defs><use xlink:href="#tip" width="2" height="2" mask="url(#m)"/></svg>'
        sanitized, width, height = sanitize_svg(svg)
        self.assertEqual((width,height),(1000,1000))
        self.assertIn(b'href="#tip"',sanitized)
        self.assertNotIn(b'xlink',sanitized)

    def test_svg_instances_reject_cycles_external_links_and_exponential_expansion(self):
        from general_svg import sanitize_svg
        bodies = ['<use href="https://example.invalid/tip.svg#tip"/>',
                  '<g id="a"><use href="#a"/></g>',
                  '<use href="#missing"/>']
        chain = '<g id="a0"><rect width="1" height="1"/></g>'
        for i in range(1,19):
            chain += '<g id="a%s"><use href="#a%s"/><use href="#a%s"/></g>' % (i,i-1,i-1)
        bodies.append('<defs>'+chain+'</defs><use href="#a18"/>')
        for body in bodies:
            with self.subTest(body=body), self.assertRaises(ValueError):
                sanitize_svg(('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2">'+body+'</svg>').encode())

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

    def test_text_separators_stay_on_one_baseline_and_tabs_use_qt_default_stops(self):
        from krita_text import _baseline_text_layout
        font=Mock();font.getbbox.side_effect=lambda text,**kw:(-1,-3,len(text)*7,2);font.getlength.side_effect=lambda text:len(text)*8
        bounds,runs=_baseline_text_layout('A\nB\rC\fD\u2028E\u2029F\tG',font)
        self.assertEqual(runs,[('A',0),('B',8),('C',16),('D',24),('E',32),('F',40),('G',80)])
        self.assertEqual(bounds,(-1,-3,87,2))
        self.assertNotIn('AB',[run for run,_ in runs])
        self.assertEqual(_baseline_text_layout('A\t',font)[0],(-1,-3,80,2))
        self.assertEqual(_baseline_text_layout('\t\n\r\f\u2028\u2029',font),((0,0,1,1),[]))

    def test_text_pipe_keeps_separator_utf16_positions_as_blank_children_without_raqm(self):
        from krita_text import render_text_source
        with tempfile.TemporaryDirectory() as tmp:
            fontdir=Path(tmp)/'.fonts';fontdir.mkdir();f=fontdir/'authored.ttf';f.write_bytes(b'authored-font-placeholder')
            resolver=SimpleNamespace(stdout=(str(f)+'\n0\nAuthored\nRegular\n').encode(),stderr=b'')
            font=Mock();font.getbbox.return_value=(0,-2,3,2)
            with patch('krita_text.Path.home',return_value=Path(tmp)),patch('krita_text.subprocess.run',return_value=resolver),patch('krita_text.features.check_feature',return_value=False),patch('krita_text.ImageFont.truetype',return_value=font),patch('krita_text.ImageDraw.Draw'):
                images,proof,sequence=render_text_source({'pipe':'true','text':'A\n\t\n\u2028A','font':'Authored,12'})
            self.assertEqual(sequence,[0,1,2,1,3,0]);self.assertEqual([image.size for image in images],[(3,4),(1,1),(1,1),(1,1)])
            self.assertTrue(all(pixel==255 for image in images[1:] for pixel in image.tobytes()))
            self.assertEqual(proof['layout'],'basic')

    def test_text_unknown_controls_remain_closed_before_font_resolution(self):
        from krita_text import render_text_source
        with patch('krita_text.subprocess.run') as resolve:
            for text in ['A\0B','A\x07B']:
                with self.subTest(text=repr(text)),self.assertRaisesRegex(ValueError,'Unsupported text control'):
                    render_text_source({'text':text})
            resolve.assert_not_called()

    def test_text_bidi_controls_are_a_layout_gap_separate_from_missing_raqm(self):
        from krita_text import render_text_source
        with patch('krita_text.subprocess.run') as resolve:
            with self.assertRaisesRegex(ValueError,'positional layout backend'):
                render_text_source({'text':'\u0627\t\u0628'})
            resolve.assert_not_called()
