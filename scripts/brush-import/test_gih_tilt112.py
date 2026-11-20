"""Genuine original single-dimensional equal-alpha GIH Qt5 degree selectors."""
import base64,copy,json,struct,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita,gih
from test_krita import kpp

def frame(i=0,w=3,h=3,channels=1):return struct.pack('>7I',29,2,w,h,channels,0x47494d50,25)+b'\0'+bytes([128+i])*(w*h*channels)
def pipe(mode='xtilt',rank=5,actual=2,unequal=False,coloured=False):return('OwnTilt\n%d dim:1 ncells:%d rank0:%d sel0:%s\n'%(rank,rank,rank,mode)).encode()+b''.join(frame(i,4 if unequal and i else 3,3,4 if coloured else 1)for i in range(actual))
class Tilt112(unittest.TestCase):
 def imported(self,tmp,mode='xtilt',actual=2,extra='',engine='paintbrush',rank=5):
  path=Path(tmp)/'Own.kpp';data=kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources=extra,engine=engine);path.write_bytes(data);out=convert.Catalog(Path(tmp)/'out');convert_krita(path,out,{'own.gih':pipe(mode,rank,actual)});return out
 def test_both_native_modes_default_import_without_new_capture_or_angular_gate(self):
  for mode in['xtilt','ytilt']:
   with self.subTest(mode=mode),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,mode);self.assertFalse(c.skipped);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],112);self.assertEqual(d['tip']['animation']['mode'],mode);self.assertEqual(d['tip']['animation']['rank'],5);self.assertEqual(d['tip']['animation']['roundingPolicy'],'qt5-half-up-v1');self.assertEqual(len(d['tip']['animation']['frames']),2);self.assertNotIn('cursorPolicy',d['tip']['animation']);self.assertNotIn('strokeInput',d['behavior']);self.assertTrue(any(n['feature']=='gihTilt'and n['status']=='supported'for n in c.brushes[0]['compatibility']))
 def test_single_actual_frame_collapses_static_without_unused_rank_policy_or_false_tilt_claim(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,actual=1);self.assertFalse(c.skipped);d=c.brushes[0]['descriptor'];self.assertNotIn('animation',d['tip']);self.assertLess(d['version'],112);self.assertFalse(any(n['feature']=='gihTilt'for n in c.brushes[0]['compatibility']));self.assertTrue(any(n['feature']=='gihSelection'and 'single actual EOF frame'in n['detail']for n in c.brushes[0]['compatibility']))
 def test_header_limits_actualEOF_and_historical_selectors_are_not_reinterpreted(self):
  for mode in['xtilt','ytilt']:
   for rank in[1,257]:
    with self.assertRaises(ValueError):gih(pipe(mode,rank))
   self.assertEqual(len(gih(pipe(mode,256,2))['frames']),2)
  for mode in['constant','pressure','velocity','random','incremental','angular']:self.assertEqual(gih(pipe(mode))['mode'],mode)
  for data in[pipe().replace(b'dim:1',b'dim:2'),pipe().replace(b'rank0:5',b'rank0:4'),pipe().replace(b'ncells:5',b'ncells:4'),pipe()[:-1],pipe()+b'extra']:
   with self.assertRaises(ValueError):gih(data)
 def test_portable_fullroundtrip_and_rejects_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);self.assertFalse(c.skipped);env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(env));out=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(p,out);self.assertEqual(out.brushes,c.brushes)
   edits=[lambda d:d.update(version=111),lambda d:d['tip']['animation'].pop('roundingPolicy'),lambda d:d['tip']['animation'].update(roundingPolicy='qt6-away-v1'),lambda d:d['tip']['animation'].update(rank=1),lambda d:d['tip']['animation'].update(rank=257),lambda d:d['tip']['animation'].update(cursorPolicy='first-request-v1'),lambda d:d['behavior'].update(erase=True),lambda d:d['behavior']['rendering'].update(blendMode='multiply'),lambda d:d['tip'].update(color={'planes':[d['tip']['mask']]*3}),lambda d:d['behavior'].update(dual={'brush':copy.deepcopy(d),'blendMode':'normal','sampling':'independent'}),lambda d:d['tip']['animation'].update(mode='pressure')]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(env);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(list(out.output.iterdir()),[]);self.assertFalse(out.assets);self.assertEqual(out.brushes,[])
 def test_coloured_and_foreign_private_origins_remain_closed(self):
  for data in[pipe(coloured=True)]:
   with tempfile.TemporaryDirectory()as tmp:
    path=Path(tmp)/'Bad.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>'));c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'own.gih':data});self.assertFalse(c.brushes);self.assertTrue(c.skipped)
  for engine in['hatchingbrush','sketchbrush','hairybrush','curvebrush']:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,engine=engine)
    if engine!='curvebrush':self.assertFalse(c.brushes);self.assertTrue(c.skipped)
    for row in c.brushes:self.assertFalse(row['descriptor']['tip'].get('animation',{}).get('mode')in('xtilt','ytilt'));self.assertFalse(any(n['feature']=='gihTilt'and n['status']=='supported'for n in row.get('compatibility',[])))
