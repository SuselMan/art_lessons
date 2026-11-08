import base64,copy,json,math,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp
from test_krita_variable_gih import frame
SIZES=[(4,2),(8,6),(2,4)]
def data(dims,actual=3):
 n=math.prod(r for m,r in dims);header=f'{n} dim:{len(dims)} ncells:{n} '+ ' '.join(f'rank{i}:{r} sel{i}:{m}'for i,(m,r)in enumerate(dims))
 return('Own118\n'+header+'\n').encode()+b''.join(frame(w,h,[(i*31+x*17+y*23)%255+1 for y in range(h)for x in range(w)])for i,(w,h)in enumerate(SIZES[:actual]))
class Geometry118(unittest.TestCase):
 def imported(self,tmp,dims,extra=''):
  p=Path(tmp)/'Own.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih" scale="1"/>',resources=extra));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':data(dims)});self.assertEqual(c.skipped,[]);return c
 def test_genuine_flat_and_2_3D_keep_original_CAS_dimensions_and_profiles(self):
  for dims in[[('angular',8)],[('xtilt',8)],[('ytilt',8)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)],[('incremental',2),('incremental',3)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    c=self.imported(tmp,dims);d=c.brushes[0]['descriptor'];a=d['tip']['animation'];self.assertEqual(d['version'],118);self.assertEqual(len(a['frames']),3);self.assertEqual([(r['sourceWidth'],r['sourceHeight'])for r in a['geometry']['frames']],SIZES)
    for i,((w,h),aid)in enumerate(zip(SIZES,a['frames'])):
     asset=c.assets[aid];side=asset['size'];raw=(c.output/asset['file']).read_bytes();x=(side-w)//2;y=(side-h)//2;actual=bytes(raw[(row+y)*side+x+col]for row in range(h)for col in range(w));self.assertEqual(actual,bytes((i*31+col*17+row*23)%255+1 for row in range(h)for col in range(w)))
    if any(m=='angular'for m,r in dims):self.assertEqual(d['behavior']['strokeInput'],{'version':1,'initialDirection':'cursorHistory'})
 def test_native_active_positional_scatter_and_foreign_origin_stay_closed(self):
  for engine,extra in[('paintbrush','<param name="PressureScatter">true</param><param name="ScatterValue">.2</param><param name="ScatterUseCurve">false</param>'),('hairybrush',''),('hatchingbrush','')]:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp)/'No.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih"/>',resources=extra,engine=engine));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':data([('angular',8)])})
    for b in c.brushes:self.assertNotEqual(b['descriptor']['tip'].get('animation',{}).get('mode'),'angular')
 def test_full_portable_closed_scope_and_rows_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=self.imported(tmp,[('pressure',2),('xtilt',3)]);env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'own.grafetto-brushes.json';p.write_text(json.dumps(env));o=convert.Catalog(Path(tmp)/'ok');convert.portable_bundle(p,o);self.assertEqual(c.brushes,o.brushes)
   edits=[lambda d:d.update(version=117),lambda d:d.update(scatter={'count':1,'radius':.1,'scale':1,'sizeJitter':0,'angleJitter':0,'flowJitter':0}),lambda d:d['tip']['animation']['geometry']['frames'][1]['maskBounds'].update(width=.5),lambda d:d['tip']['animation']['geometry']['frames'].pop(),lambda d:d['tip'].update(color={'planes':[d['tip']['mask']]*3}),lambda d:d['tip'].update(material={'kind':'lightness','gray':d['tip']['mask'],'strength':1}),lambda d:d['behavior'].update(dual={'brush':copy.deepcopy(d),'blendMode':'multiply'}),lambda d:d['behavior']['rendering'].update(blendMode='multiply')]
   for i,edit in enumerate(edits):
    bad=copy.deepcopy(env);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));o=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,o)
    self.assertEqual(list(o.output.iterdir()),[])
