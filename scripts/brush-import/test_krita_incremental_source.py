"""Authored incremental GIH mechanism; no native brush data or RNG fitting."""
import struct
from pathlib import Path
import tempfile
import unittest
import convert
from krita_import import convert_krita
from test_krita import kpp

def pipe(mode='incremental'):
    frames=[struct.pack('>7I',29,2,2,2,1,0x47494d50,25)+b'\0'+v for v in [bytes([0,40,80,120]),bytes([255,200,100,0])]]
    return ('Authored\n2 ncells:2 dim:1 rank0:2 sel0:'+mode+'\n').encode()+b''.join(frames)

class IncrementalSourceTests(unittest.TestCase):
    def test_retains_all_frames_common_grid_and_source_program(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'self.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="self.gih" scale="1"/>'))
            catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'self.gih':pipe()})
            self.assertEqual(catalog.skipped,[])
            d=catalog.brushes[0]['descriptor'];tip=d['tip']
            self.assertEqual(tip['animation']['mode'],'incremental')
            self.assertEqual(len(tip['animation']['frames']),2)
            self.assertEqual(tip['mask'],tip['animation']['frames'][0])
            self.assertEqual(tip['imageSampling']['sourceRect'],{'x':0,'y':0,'width':2,'height':2})
            self.assertEqual(d['sourceStamp']['brush']['width'],2)
            actual=[(catalog.output/catalog.assets[id]['file']).read_bytes()for id in tip['animation']['frames']]
            self.assertEqual(actual,[bytes([0,40,80,120]),bytes([255,200,100,0])])
    def test_random_pipe_does_not_gain_incremental_source_capability(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);path=root/'self.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="self.gih"/>'))
            catalog=convert.Catalog(root/'out');convert_krita(path,catalog,{'self.gih':pipe('random')})
            self.assertNotIn('sourceStamp',catalog.brushes[0]['descriptor'])

if __name__=='__main__':unittest.main()
