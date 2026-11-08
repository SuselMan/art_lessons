from pathlib import Path
import tempfile,unittest,copy,json,base64,hashlib,struct,math
import convert
from krita_import import convert_krita
from test_krita import kpp
SIZES=[(4,2),(8,6),(2,4)]
def pipe124(dims,sizes=None):
 sizes=sizes or SIZES;n=math.prod(rank for mode,rank in dims);header=f'{n} dim:{len(dims)} ncells:{n} '+' '.join(f'rank{i}:{rank} sel{i}:{mode}'for i,(mode,rank)in enumerate(dims));frames=[]
 for i,(w,h)in enumerate(sizes):
  rgba=bytes(v for y in range(h)for x in range(w)for v in(*[255 if c==i else 0 for c in range(3)],128 if i==1 else 255));frames.append(struct.pack('>7I',29,2,w,h,4,0x47494d50,25)+b'\0'+rgba)
 return('Own124\n'+header+'\n').encode()+b''.join(frames)
class UnequalLightness124(unittest.TestCase):
 def imported(self,tmp,dims=None,sizes=None,engine='paintbrush',app=2):
  original=kpp('<Brush type="gbr_brush" filename="own124.gih" brushApplication="'+str(app)+'" scale="1" AdjustmentVersion="2" AutoAdjustMidPoint="false" AdjustmentMidPoint="127" BrightnessAdjustment="0" ContrastAdjustment="0"/>',engine=engine);p=Path(tmp)/'Own124.kpp';p.write_bytes(original);c=convert.Catalog(Path(tmp)/'native');convert_krita(p,c,{'own124.gih':pipe124(dims or [('xtilt',5)],sizes)});return c,original
 def test_genuine_all_sensor_and_sequence_geometry_keeps_original_padded_alpha_gray_and_ids(self):
  for dims in[[('angular',5)],[('xtilt',5)],[('ytilt',5)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)],[('incremental',2),('incremental',3)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    c,original=self.imported(tmp,dims);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],124);tip=d['tip'];a=tip['animation'];m=tip['material'];self.assertEqual([(v['sourceWidth'],v['sourceHeight'])for v in a['geometry']['frames']],SIZES);self.assertNotIn('color',tip)
    for i,(w,h)in enumerate(SIZES):
     side=8 if i==1 else 4
     for aid,value in[(a['frames'][i],128 if i==1 else 255),(m['grayFrames'][i],[87,127,39][i])]:
      expected=bytearray(side*side)
      for y in range(h):expected[(y+(side-h)//2)*side+(side-w)//2:(y+(side-h)//2)*side+(side-w)//2+w]=bytes([value])*w
      asset=c.assets[aid];self.assertEqual(asset['size'],side);self.assertEqual((c.output/asset['file']).read_bytes(),bytes(expected));self.assertEqual(aid,'asset:'+hashlib.sha256(expected).hexdigest())
    seed={'schemaVersion':1,'importerRenderingVersion':3,'sourceSettingsSha256':hashlib.sha256(original).hexdigest(),'rendering':{k:v for k,v in d.items()if k!='id'}};self.assertEqual(d['id'],'imported-'+hashlib.sha256(json.dumps(seed,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()[:24])
 def test_equal123_and_alpha118_rgb119_foreign_gradient_controls_remain_separate(self):
  for sizes,app,version in[([(4,2)]*3,2,123),(SIZES,1,119)]:
   with self.subTest(app=app,version=version),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,sizes=sizes,app=app);self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes[0]['descriptor']['version'],version)
  # Genuine ALPHAMASK L-GBR source, not RGBA application0 (which is outside
  # the existing sensor whitelist and must remain rejected).
  from test_gih_geometry118 import data as alpha118_data
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);p=root/'Old118.kpp';p.write_bytes(kpp('<Brush type="gbr_brush" filename="old118.gih" brushApplication="0" scale="1"/>'));c=convert.Catalog(root/'old118');convert_krita(p,c,{'old118.gih':alpha118_data([('xtilt',5)])});self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes[0]['descriptor']['version'],118);self.assertNotIn('material',c.brushes[0]['descriptor']['tip']);self.assertNotIn('color',c.brushes[0]['descriptor']['tip'])
  for engine in['hairybrush','hatchingbrush','sketchbrush','curvebrush']:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,engine=engine);self.assertFalse(any(b['descriptor']['version']==124 for b in c.brushes))
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,app=3);self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes[0]['descriptor']['version'],126);self.assertIn('gradient',c.brushes[0]['descriptor']['tip']['color'])
 def test_portable_whole124_tuple_admission_rejects_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp);payload={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};p=Path(tmp)/'Own.grafetto-brushes.json';p.write_text(json.dumps(payload));good=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(p,good);self.assertEqual(good.brushes,c.brushes)
   for case in['version','graySide','grayCount','geometry','bounds','width','gradient','color','dual','scatter','policy','erase']:
    bad=copy.deepcopy(payload);d=bad['library']['brushes'][0]['descriptor'];a=d['tip']['animation'];m=d['tip']['material']
    if case=='version':d['version']=123
    elif case=='graySide':m['grayFrames'][1]=m['grayFrames'][0]
    elif case=='grayCount':m['grayFrames'].pop()
    elif case=='geometry':a.pop('geometry')
    elif case=='bounds':a['geometry']['frames'][1]['maskBounds']['x']=.1
    elif case=='width':a['geometry']['frames'][1]['sourceWidth']=2049
    elif case=='gradient':m['kind']='gradient'
    elif case=='color':d['tip']['color']={'planes':[m['gray']]*3,'frames':[[g]*3 for g in m['grayFrames']]}
    elif case=='dual':d['behavior']['dual']={}
    elif case=='scatter':d['scatter']={'count':1,'radius':.1,'scale':1,'sizeJitter':0,'angleJitter':0,'flowJitter':0}
    elif case=='policy':a.pop('roundingPolicy')
    else:d['behavior']['erase']=True
    p.write_text(json.dumps(bad));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(p,dest)
    self.assertEqual(dest.assets,{});self.assertEqual(dest.brushes,[]);self.assertEqual(list(dest.output.iterdir()),[])
