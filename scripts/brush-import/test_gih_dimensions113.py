"""Authored deterministic multi-axis GIH source; no redistributed stock fixture."""
import base64,copy,json,struct,tempfile,unittest,math
from pathlib import Path
import convert
from krita_import import convert_krita,gih
from test_krita import kpp

def frame(i):return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([255,128+i,255,128,255,128,255,128,255])
def pipe(dimensions,actual=None):
 count=math.prod(rank for mode,rank in dimensions);actual=count if actual is None else actual
 header='%d ncells:%d dim:%d '%(count,count,len(dimensions))+' '.join('rank%d:%d sel%d:%s'%(i,rank,i,mode)for i,(mode,rank)in enumerate(dimensions))
 return ('Own\n'+header+'\n').encode()+b''.join(frame(i%100)for i in range(actual))
class Dimensions113(unittest.TestCase):
 def imported(self,tmp,dims,actual):
  p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>'));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe(dims,actual)});self.assertEqual(c.skipped,[]);return c
 def test_genuine_two_three_four_dimensions_and_single_EOF_default_API(self):
  for dims,actual in[([('pressure',2),('xtilt',3)],5),([('pressure',2),('velocity',2),('angular',2)],3),([('pressure',2),('xtilt',2),('ytilt',2),('angular',2)],1)]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,dims,actual);d=c.brushes[0]['descriptor'];a=d['tip']['animation'];self.assertEqual(d['version'],113);self.assertEqual(a['mode'],'dimensions');self.assertEqual(a['dimensions'],[{'mode':m,'rank':r}for m,r in dims]);self.assertEqual(len(a['frames']),actual);self.assertNotIn('rank',a);self.assertNotIn('geometry',a)
    if any(m=='angular'for m,r in dims):self.assertEqual(a['cursorPolicy'],'first-request-v1');self.assertEqual(d['behavior']['strokeInput'],{'version':1,'initialDirection':'cursorHistory'})
    if any(m in('xtilt','ytilt')for m,r in dims):self.assertEqual(a['roundingPolicy'],'qt5-half-up-v1')
 def test_full_portable_positive_and_closed_negative_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,[('pressure',2),('xtilt',2),('velocity',2),('angular',2)],3);data={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(data));o=convert.Catalog(Path(tmp)/'round');convert.portable_bundle(p,o);self.assertEqual(o.brushes,c.brushes)
   edits=[lambda d:d.update(version=112),lambda d:d['tip']['animation'].update(rank=8),lambda d:d['tip']['animation']['dimensions'][0].update(mode='random'),lambda d:d['tip']['animation']['dimensions'][0].update(rank=256),lambda d:d['tip']['animation'].pop('roundingPolicy'),lambda d:d['tip']['animation'].pop('cursorPolicy'),lambda d:d['behavior'].pop('speedInput'),lambda d:d['behavior'].pop('strokeInput'),lambda d:d['behavior'].update(dual={'brush':copy.deepcopy(d),'blendMode':'multiply'})]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));o=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,o)
    self.assertEqual(list(o.output.iterdir()),[])
 def test_rejects_random_incremental_bad_product_and_incomplete_headers(self):
  for mode in['random','incremental']:
   with self.assertRaises(ValueError):gih(pipe([(mode,2),('pressure',2)]))
  data=pipe([('pressure',2),('xtilt',3)],3)
  for bad in[data.replace(b'ncells:6',b'ncells:5'),data.replace(b'rank1:3',b'rank1:2'),data.replace(b'sel1:xtilt',b'sel2:xtilt'),data.replace(b'dim:2',b'dim:5'),data+b'X']:
   with self.assertRaises(ValueError):gih(bad)
 def test_private_foreign_origins_do_not_claim_tensor_support(self):
  for engine,extra in[('hatchingbrush',''),('hairybrush',''),('sketchbrush','<param name="Sketch/simpleMode">true</param>'),('curvebrush','<param name="Curve/lineWidth">4</param>')]:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp)/'Foreign.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources=extra,engine=engine));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe([('pressure',2),('xtilt',3)],3)})
    if engine!='curvebrush':self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)
    for b in c.brushes:self.assertNotEqual(b['descriptor']['tip'].get('animation',{}).get('mode'),'dimensions')
