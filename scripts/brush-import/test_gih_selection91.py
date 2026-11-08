"""Genuine authored GIH/KPP plus portable roundtrip; no native artwork."""
import base64,copy,json,struct,tempfile,unittest
from pathlib import Path
import convert
from krita_import import gih,convert_krita
from test_krita import kpp

def frame(value):return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([value])*9
def pipe(mode,rank=5,actual=2):return ('Own\n%d dim:1 ncells:%d rank0:%d sel0:%s\n'%(rank,rank,rank,mode)).encode()+b''.join(frame(i%255)for i in range(actual))
class Selection91(unittest.TestCase):
 def imported(self,tmp,mode,rank=5,actual=2):
  p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>'))
  c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe(mode,rank,actual)});self.assertEqual(c.skipped,[]);return c
 def test_declared_rank_is_independent_of_actual_frame_cap(self):
  for rank in [5,257,2147483647]:
   with self.subTest(rank=rank),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,'pressure',rank);d=c.brushes[0]['descriptor'];self.assertGreaterEqual(d['version'],91)
    self.assertEqual(d['tip']['animation']['rank'],rank);self.assertEqual(len(d['tip']['animation']['frames']),2)
    self.assertEqual(d['tip']['animation']['mode'],'pressure')
 def test_constant_and_eof_single_frame(self):
  for mode in ['constant','pressure']:
   for count in [1,2]:
    with tempfile.TemporaryDirectory()as tmp:
     c=self.imported(tmp,mode,5,count);d=c.brushes[0]['descriptor'];self.assertGreaterEqual(d['version'],91)
     if count==1:self.assertNotIn('animation',d['tip'])
     else:
      self.assertEqual(d['tip']['animation']['mode'],mode)
      self.assertEqual('rank'in d['tip']['animation'],mode=='pressure')
 def test_hard_actual_cap_and_native_int_header_bounds(self):
  for data in [pipe('pressure',257,257),pipe('pressure',2147483648),pipe('pressure',0),pipe('random',257),pipe('incremental',257),pipe('xtilt')]:
   with self.assertRaises(ValueError):gih(data)
  with self.assertRaises(ValueError):gih(pipe('pressure').replace(b'rank0:5',b'rank0:4'))
 def test_portable_roundtrip_and_rejection_before_cas(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,'pressure',257);library=c.write();data={'library':library,'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}}
   p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(data));out=convert.Catalog(Path(tmp)/'round');convert.portable_bundle(p,out);self.assertEqual(out.brushes,c.brushes)
   edits=[lambda d:d.update(version=90),lambda d:d['tip']['animation'].pop('rank'),lambda d:d['tip']['animation'].update(rank=True),lambda d:d['tip']['animation'].update(rank=2147483648),lambda d:d['tip']['animation'].update(mode='random')]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(list(out.output.iterdir()),[])
