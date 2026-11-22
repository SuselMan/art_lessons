"""KPP/KoResource PNG permits preset metadata after image data."""
import struct
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from PIL import Image, PngImagePlugin

from brush_contract import Catalog
from krita_import import convert_krita
from test_krita_size_strength import authored
from test_myb_koresource import MybKoResourceTests


def move_preset_after_idat(data):
    chunks=[]; pos=8
    while pos<len(data):
        length=struct.unpack('>I',data[pos:pos+4])[0]
        chunk=data[pos:pos+12+length]
        chunks.append(chunk);pos+=12+length
    selected=[c for c in chunks if c[4:8] in (b'tEXt',b'zTXt',b'iTXt') and c[8:].startswith(b'preset\0')]
    if len(selected)!=1:raise AssertionError('expected one preset text chunk')
    chunks.remove(selected[0]);end=next(i for i,c in enumerate(chunks) if c[4:8]==b'IEND')
    chunks.insert(end,selected[0])
    return data[:8]+b''.join(chunks)


class PostIdatMetadataTests(unittest.TestCase):
    def test_standalone_kpp_and_myb(self):
        samples={'brush.kpp':authored({'PressureRotation':'false'}),
                 'brush.myb':MybKoResourceTests().png_preset()}
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name,raw in samples.items():
                with self.subTest(name=name):
                    records=[]
                    for index,data in enumerate((raw,move_preset_after_idat(raw))):
                        path=root/name;path.write_bytes(data);catalog=Catalog(root/(name+str(index)))
                        convert_krita(path,catalog)
                        self.assertEqual(catalog.skipped,[]);self.assertEqual(len(catalog.brushes),1)
                        descriptor=dict(catalog.brushes[0]['descriptor']);descriptor.pop('id')
                        records.append(descriptor)
                    self.assertEqual(records[0],records[1])

    def test_bundle_continues_after_malformed_preset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'brushes.bundle'
            info=PngImagePlugin.PngInfo();info.add_text('preset','<Preset')
            stream=io.BytesIO();Image.new('RGBA',(2,2)).save(stream,format='PNG',pnginfo=info)
            with zipfile.ZipFile(path,'w') as archive:
                archive.writestr('a.kpp',move_preset_after_idat(authored({'PressureRotation':'false'})))
                archive.writestr('b.myb',move_preset_after_idat(MybKoResourceTests().png_preset()))
                archive.writestr('c.kpp',b'\x89PNG\r\n\x1a\ninvalid')
                archive.writestr('d.kpp',authored({'PressureRotation':'false'}))
                archive.writestr('e.kpp',move_preset_after_idat(stream.getvalue()))
            catalog=Catalog(root/'out');convert_krita(path,catalog)
            self.assertEqual([b['source'] for b in catalog.brushes],['a.kpp','b.myb','d.kpp'])
            self.assertEqual([x['name'] for x in catalog.skipped],['c','e'])
            self.assertTrue(all(x['reasons'] for x in catalog.skipped))
