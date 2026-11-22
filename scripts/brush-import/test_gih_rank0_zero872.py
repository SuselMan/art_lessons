"""GIH rank0: missing/zero rank demotes incremental/angular like Krita sanitize().

Krita reference (pinned source, libs/brush):
  kis_pipebrush_parasite.cpp  init()        -> rank[i] starts at 0 when rank0 is absent
  kis_pipebrush_parasite.cpp  sanitize()    -> rank0==0 with incremental/angular becomes constant
  kis_pipebrush_parasite.cpp  setBrushesCount() -> rank0==0 keeps brushesCount[0]=ncells
  kis_imagepipe_brush.cpp     selectPost()  -> incremental does index%rank (divide by zero)
  kis_imagepipe_brush.cpp     canPaintFor() -> needsMovement blocks painting until distance>=0.5
The angular parasite keeps needsMovement=true after sanitize(), so a demoted
angular pipe is not fully supported here: it is reported, never claimed equal.
"""
import struct,tempfile,unittest
from pathlib import Path
import convert
from krita_import import gih,convert_krita
from test_krita import kpp

def frame(i):return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([255,128+i,255,128,255,128,255,128,255])
def pipe(count=2,actual=2,header=None):
    head=header if header is not None else 'dim:1 ncells:%d rank0:%d sel0:%%s'%(count,count)
    return ('Own\n%d %s\n'%(count,head%('incremental')if'%s'in head else head)).encode()+b''.join(frame(i)for i in range(actual))
def header(count,extra):return 'dim:1 ncells:%d %s'%(count,extra)
def imported(tmp,head,actual=2):
    p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>'))
    data=('Own\n%d %s\n'%head).encode()+b''.join(frame(i)for i in range(actual))
    c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':data});return c
class Rank0Zero872(unittest.TestCase):
 def test_missing_and_zero_rank_demote_incremental_and_angular(self):
  for extra in ['sel0:incremental','sel0:angular','rank0:0 sel0:incremental','rank0:0 sel0:angular']:
   with self.subTest(extra=extra):
    data=pipe(2,2,header(2,extra))
    result=gih(data)
    # Krita sanitize() demotes both modes to constant and keeps every frame.
    self.assertEqual(result['mode'],'constant')
    self.assertEqual(len(result['frames']),2)
    self.assertNotIn('selectorRank',result)
    self.assertEqual(result['rankZeroDemotion']['declaredMode'],extra.split('sel0:')[1])
    self.assertEqual(result['rankZeroDemotion']['declaredRank'],0)
 def test_explicit_non_zero_rank_is_honoured(self):
  explicit=gih(pipe(2,2,header(2,'rank0:2 sel0:incremental')))
  self.assertEqual(explicit['mode'],'incremental')
  self.assertNotIn('rankZeroDemotion',explicit)
  self.assertNotIn('selectorRank',explicit)
  self.assertEqual(len(explicit['frames']),2)
  # Krita brushesCount=ncells/rank, index=seqNo%rank -> stride spaced frames.
  strided=gih(pipe(4,4,header(4,'rank0:2 sel0:incremental')))
  self.assertEqual(strided['mode'],'incremental')
  self.assertEqual(strided['selectorRank'],2)
  self.assertEqual(len(strided['frames']),2)
  self.assertEqual([f.getpixel((0,0))for f in strided['frames']],[255,255])
  self.assertNotIn('rankZeroDemotion',strided)
 def test_unsupported_rank_combinations_fail_explicitly(self):
  for count,extra in [(4,'rank0:2 sel0:angular'),(2,'rank0:0 sel0:pressure'),(2,'rank0:0 sel0:velocity'),(2,'rank0:0 sel0:xtilt'),(2,'rank0:0 sel0:random'),(2,'rank0:-1 sel0:incremental'),(2,'rank0:257 sel0:incremental')]:
   with self.subTest(extra=extra),self.assertRaises(ValueError):gih(pipe(count,2,header(count,extra)))
 def test_demoted_angular_is_reported_and_never_claimed_supported(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=imported(tmp,(2,'dim:1 ncells:2 rank0:0 sel0:angular'))
   self.assertEqual(c.skipped,[])
   record=c.brushes[0];d=record['descriptor']
   self.assertEqual(d['tip']['animation']['mode'],'constant')
   notes={n['feature']:n for n in record['compatibility']}
   self.assertIn('gihRankZeroAngular',notes)
   self.assertNotEqual(notes['gihRankZeroAngular']['status'],'supported')
   self.assertNotIn('gihAngular',notes)
   self.assertFalse(any(n.get('feature')=='gihAngular'and n.get('status')=='supported'for n in record['compatibility']))
   self.assertTrue(any('gihRankZeroAngular' in w for w in record['warnings']))
 def test_demoted_incremental_is_reported(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=imported(tmp,(2,'dim:1 ncells:2 sel0:incremental'))
   self.assertEqual(c.skipped,[])
   record=c.brushes[0]
   self.assertEqual(record['descriptor']['tip']['animation']['mode'],'constant')
   notes={n['feature']:n for n in record['compatibility']}
   self.assertIn('gihRankZeroSelection',notes)
   self.assertNotEqual(notes['gihRankZeroSelection']['status'],'supported')
   self.assertTrue(any('gihRankZeroSelection' in w for w in record['warnings']))
 def test_explicit_rank_keeps_incremental_mode_and_no_demotion_note(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=imported(tmp,(2,'dim:1 ncells:2 rank0:2 sel0:incremental'))
   record=c.brushes[0]
   self.assertEqual(record['descriptor']['tip']['animation']['mode'],'incremental')
   self.assertFalse(any(n['feature'].startswith('gihRankZero')for n in record['compatibility']))
