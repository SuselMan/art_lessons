from pathlib import Path
import tempfile,unittest,copy,json,base64,hashlib,struct,math
import convert
from krita_import import convert_krita
from brush_contract import finalize_identity
from test_krita import kpp
from test_gih_unequal_lightness124 import pipe124,SIZES

def spatial126(dims):
 n=math.prod(rank for mode,rank in dims);header=f'{n} dim:{len(dims)} ncells:{n} '+' '.join(f'rank{i}:{rank} sel{i}:{mode}'for i,(mode,rank)in enumerate(dims));frames=[]
 for i,(w,h)in enumerate(SIZES):
  rgba=bytes(v for y in range(h)for x in range(w)for v in((([0,0,0]if x<4 else[255,255,255])if i==1 else[255 if c==i else 0 for c in range(3)])+[128 if i==1 else 255]));frames.append(struct.pack('>7I',29,2,w,h,4,0x47494d50,25)+b'\0'+rgba)
 return('Own126 spatial\n'+header+'\n').encode()+b''.join(frames)

class UnequalGradient126Tests(unittest.TestCase):
 def imported(self,tmp,dims=None,sizes=None,engine='paintbrush',spatial=False):
  dims=dims or [('xtilt',5)];root=Path(tmp);raw=kpp('<Brush type="gbr_brush" filename="own126.gih" brushApplication="3" scale="1" AdjustmentVersion="2" AutoAdjustMidPoint="false" AdjustmentMidPoint="127" BrightnessAdjustment="0" ContrastAdjustment="0"/>',engine=engine);p=root/'Own126.kpp';p.write_bytes(raw);c=convert.Catalog(root/'native');convert_krita(p,c,{'own126.gih':spatial126(dims)if spatial else pipe124(dims,sizes)});return c,raw
 def test_genuine_selected_original_geometry_literal_gray_alpha_CAS_and_identity(self):
  for dims in[[('angular',5)],[('xtilt',5)],[('ytilt',5)],[('pressure',2),('xtilt',3)],[('random',2),('angular',2),('velocity',2)],[('incremental',2),('incremental',3)]]:
   with self.subTest(dims=dims),tempfile.TemporaryDirectory()as tmp:
    c,raw=self.imported(tmp,dims);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],126);self.assertEqual(finalize_identity(copy.deepcopy(d),raw)['id'],d['id']);t=d['tip'];a=t['animation'];g=t['color']['gradient'];self.assertNotIn('material',t);self.assertEqual(g['sampling'],'filteredGray-v1');self.assertEqual([(v['sourceWidth'],v['sourceHeight'])for v in a['geometry']['frames']],SIZES)
    for i,(w,h)in enumerate(SIZES):
     side=8 if i==1 else 4
     for aid,value in[(a['frames'][i],128 if i==1 else 255),(g['grayFrames'][i],[87,127,39][i])]:
      expected=bytearray(side*side)
      for y in range(h):expected[(y+(side-h)//2)*side+(side-w)//2:(y+(side-h)//2)*side+(side-w)//2+w]=bytes([value])*w
      asset=c.assets[aid];self.assertEqual(asset['size'],side);self.assertEqual((c.output/asset['file']).read_bytes(),bytes(expected));self.assertEqual(aid,'asset:'+hashlib.sha256(expected).hexdigest())
 def test_spatial_edge_gray_remains_independent_of_partial_alpha_before_captured_palette(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,spatial=True);self.assertEqual(c.skipped,[]);t=c.brushes[0]['descriptor']['tip'];gray=t['color']['gradient']['grayFrames'][1];alpha=t['animation']['frames'][1];gb=(c.output/c.assets[gray]['file']).read_bytes();ab=(c.output/c.assets[alpha]['file']).read_bytes();self.assertEqual([gb[11],gb[12]],[0,255]);self.assertEqual([ab[11],ab[12]],[128,128]);self.assertEqual((gb[11]+gb[12]+1)//2,128);self.assertEqual((128*128+127)//255,64)
 def test_equal125_and_foreign_private_origins_stay_separate(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,sizes=[(4,2)]*3);self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes[0]['descriptor']['version'],125);self.assertNotIn('geometry',c.brushes[0]['descriptor']['tip']['animation'])
  for engine in['hairybrush','hatchingbrush','sketchbrush','curvebrush']:
   with self.subTest(engine=engine),tempfile.TemporaryDirectory()as tmp:
    c,_=self.imported(tmp,engine=engine);self.assertFalse(any(b['descriptor']['version']==126 for b in c.brushes))
 def test_portable_full126_scope_rejects_mismatched_or_oversized_pairs_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.imported(tmp,spatial=True);env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(path,good);self.assertEqual(good.brushes,c.brushes)
   for case in['version','geometry','bounds','rootbounds','width','graySide','grayCount','grayRoot','sampling','policy','dual','child','scatter','material','imageSampling','erase','cloneNull','over512']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];t=d['tip'];a=t['animation'];g=t['color']['gradient']
    if case=='version':d['version']=125
    elif case=='geometry':a.pop('geometry')
    elif case=='bounds':a['geometry']['frames'][1]['maskBounds']['x']=.1
    elif case=='rootbounds':t['maskBounds']['x']=.1
    elif case=='width':a['geometry']['frames'][1]['sourceWidth']=513
    elif case=='graySide':g['grayFrames'][1]=g['gray']
    elif case=='grayCount':g['grayFrames'].pop()
    elif case=='grayRoot':g['gray']=g['grayFrames'][1]
    elif case=='sampling':g.pop('sampling')
    elif case=='policy':a.pop('roundingPolicy')
    elif case=='dual':d['behavior']['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);t.pop('animation');t.pop('color');d['behavior']['dual']={'brush':child,'blendMode':'normal'}
    elif case=='scatter':d['scatter']={'count':1,'radius':.1,'scale':1,'sizeJitter':0,'angleJitter':0,'flowJitter':0}
    elif case=='material':t['material']={}
    elif case=='imageSampling':t['imageSampling']={}
    elif case=='erase':d['behavior']['erase']=True
    elif case=='cloneNull':d['clone']=None
    else:
     raw=bytes(1024*1024);digest=hashlib.sha256(raw).hexdigest();aid='asset:'+digest;bad['assets'][aid]=base64.b64encode(raw).decode();bad['library']['assets'].append({'id':aid,'size':1024,'file':digest+'.bin'});g['grayFrames'][1]=aid
    path.write_text(json.dumps(bad));dest=convert.Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{});self.assertEqual(list(dest.output.iterdir()),[])
