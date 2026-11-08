"""Genuine authored alpha GIH default importer and strict portable110."""
import base64,copy,json,struct,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita,gih
from test_krita import kpp

def frame(i):return struct.pack('>7I',29,2,3,3,1,0x47494d50,25)+b'\0'+bytes([255,128+i,255,128,255,128,255,128,255])
def pipe(rank=8,actual=2,mode='angular'):return ('Own\n%d dim:1 ncells:%d rank0:%d sel0:%s\n'%(rank,rank,rank,mode)).encode()+b''.join(frame(i)for i in range(actual))
class Angular110(unittest.TestCase):
 def imported(self,tmp,actual=2,extra=''):
  p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources=extra));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe(actual=actual)});self.assertEqual(c.skipped,[]);return c
 def test_default_native_import_enables_author_capture_without_cli_optin(self):
  for actual in[1,2]:
   with tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,actual);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],110);self.assertEqual(d['behavior']['strokeInput'],{'version':1,'initialDirection':'cursorHistory'});self.assertEqual(d['tip']['animation']['cursorPolicy'],'first-request-v1');self.assertEqual(d['tip']['animation']['rank'],8);self.assertEqual(len(d['tip']['animation']['frames']),actual)
 def test_portable_positive_and_closed_negatives(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp);data={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(data));out=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(p,out);self.assertEqual(out.brushes,c.brushes)
   edits=[lambda d:d.update(version=109),lambda d:d['tip']['animation'].update(rank=1),lambda d:d['tip']['animation'].pop('cursorPolicy'),lambda d:d['behavior'].pop('strokeInput'),lambda d:d['behavior'].update(erase=True),lambda d:d['behavior']['rendering'].update(blendMode='multiply'),lambda d:d['behavior']['strokeInput'].update(fanCorners={'stepDegrees':30}),lambda d:d['behavior'].update(dual={'brush':copy.deepcopy(d),'blendMode':'multiply'})]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(list(out.output.iterdir()),[])
 def test_rank_limits_and_old_pressure_velocity_preserved(self):
  for rank in[1,257]:
   with self.assertRaises(ValueError):gih(pipe(rank))
  for mode in['pressure','velocity','random','incremental']:self.assertEqual(gih(pipe(mode=mode))['mode'],mode)

 def test_active_nonidentity_rotation_is_not_silently_given_source_capture(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'Bad.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources='<param name="PressureRotation">true</param><param name="RotationSensor"><![CDATA[<params id="pressure"/>]]></param>'));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe()});self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)

 def test_foreign_adapter_origins_do_not_claim_supported_angular(self):
  for engine,extra in [('hatchingbrush',''),('hairybrush',''),('sketchbrush','<param name="Sketch/simpleMode">true</param>'),('curvebrush','<param name="Curve/lineWidth">4</param>')]:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp)/'Foreign.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources=extra,engine=engine));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':pipe()})
    # Curve deliberately ignores the original brush_definition; it may import its own round tip.
    if engine!='curvebrush':self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)
    for record in c.brushes:
     self.assertNotEqual(record['descriptor']['tip'].get('animation',{}).get('mode'),'angular')
     self.assertFalse(any(n.get('feature')=='gihAngular'and n.get('status')=='supported'for n in record.get('compatibility',[])))
