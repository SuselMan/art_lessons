"""Authored native GIH velocity plus exact portable capture guards."""
import base64,copy,json,struct,tempfile,unittest
from pathlib import Path
import convert
from krita_import import gih,convert_krita
from test_krita import kpp

def frame(value):return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([value])*9
def pipe(rank=5,actual=2,mode='velocity'):return ('Own\n%d dim:1 ncells:%d rank0:%d sel0:%s\n'%(rank,rank,rank,mode)).encode()+b''.join(frame(i%255)for i in range(actual))
class Selection92(unittest.TestCase):
 def imported(self,tmp,rank=5,actual=2,mode='velocity',extra=''):
  p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources=extra));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe(rank,actual,mode)});self.assertEqual(c.skipped,[]);return c
 def bundle(self,c,tmp):
  m=c.write();data={'library':m,'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(data));return p,data
 def test_velocity_declared_rank_and_capture_profile_retained(self):
  for rank in[5,256]:
   with tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,rank);d=c.brushes[0]['descriptor'];self.assertGreaterEqual(d['version'],92);self.assertEqual(d['tip']['animation']['rank'],rank);self.assertEqual(d['tip']['animation']['mode'],'velocity');self.assertEqual(len(d['tip']['animation']['frames']),2);self.assertEqual(d['behavior']['speedInput'],{'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'})
 def test_velocity_rejects_rank257_without_narrowing_pressure_or_constant(self):
  with self.assertRaisesRegex(ValueError,'velocity declared rank'):gih(pipe(257))
  for mode in['pressure','constant']:self.assertEqual(gih(pipe(257,mode=mode))['declaredCount'],257)
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,1,1);self.assertNotIn('animation',c.brushes[0]['descriptor']['tip']);self.assertGreaterEqual(c.brushes[0]['descriptor']['version'],92)
 def test_portable_roundtrip_and_capture_rank_rejection_before_output(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);p,data=self.bundle(c,tmp);out=convert.Catalog(Path(tmp)/'round');convert.portable_bundle(p,out);self.assertEqual(out.brushes,c.brushes)
   edits=[lambda d:d.update(version=91),lambda d:d['tip']['animation'].update(rank=257),lambda d:d['tip']['animation'].pop('rank'),lambda d:d['behavior'].pop('speedInput'),lambda d:d['behavior']['speedInput'].update(maximum=60),lambda d:d['behavior']['speedInput'].update(version=True)]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(list(out.output.iterdir()),[])
 def test_portable_child_cannot_capture_from_its_own_profile_without_root(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);p,data=self.bundle(c,tmp);parent=data['library']['brushes'][0]['descriptor'];child=copy.deepcopy(parent);parent['tip']['animation']['mode']='incremental';parent['tip']['animation'].pop('rank');parent['behavior']['dual']={'brush':child,'blendMode':'multiply','sampling':'independent'}
   p.write_text(json.dumps(data));out=convert.Catalog(Path(tmp)/'dual');convert.portable_bundle(p,out);self.assertEqual(len(out.brushes),1)
   for i,edit in enumerate([lambda d:d['behavior'].pop('speedInput'),lambda d:d['behavior']['speedInput'].update(maximum=60),lambda d:d.update(version=91),lambda d:d['behavior']['dual']['brush']['behavior']['speedInput'].update(maximum=60)]):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('dualbad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(list(out.output.iterdir()),[])
