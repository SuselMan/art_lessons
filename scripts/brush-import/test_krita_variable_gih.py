"""Authored native KPP/GBR/GIH bytes, no borrowed artwork or lower descriptor mutation."""
import base64,copy,importlib.util,json,struct,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita import kpp

ROOT=Path(__file__).resolve().parents[0]
ACTUAL=Path.cwd()/'scripts/brush-import/krita_import.py'

def frame(width,height,values,channels=1,spacing=25):
    payload=bytes(values)
    if len(payload)!=width*height*channels:raise ValueError('Authored GBR payload length')
    return struct.pack('>7I',29,2,width,height,channels,0x47494d50,spacing)+b'\0'+payload

def pipe(frames,mode='incremental',declared=None):
    count=len(frames)if declared is None else declared
    return ('Authored unequal\n%d dim:1 rank0:%d sel0:%s\n'%(count,count,mode)).encode()+b''.join(frames)

def rgba(w,h):
    return bytes(v for y in range(h)for x in range(w)for v in(20+x,40+y,200-x,64+(x+y)%4*50))

class VariableGihTests(unittest.TestCase):
 def test_random_rank_larger_than_frame_count_wraps_before_selection(self):
    from krita_import import gih
    originals=[frame(2,2,[value]*4) for value in (10,20,30)]
    data=pipe(originals,'random').replace(b'rank0:3',b'rank0:5')
    result=gih(data);self.assertEqual(result['declaredCount'],3);self.assertEqual(result['decodedCount'],3)
    self.assertEqual([image.getpixel((0,0)) for image in result['frames']],[10,10,10,10,10])
    five=originals+[frame(2,2,[40]*4),frame(2,2,[50]*4)]
    result=gih(pipe(five,'incremental').replace(b'rank0:5',b'rank0:3'))
    self.assertEqual([image.getpixel((0,0)) for image in result['frames']],[10,20,30])
    with tempfile.TemporaryDirectory() as tmp:
      c,_=self.imported(tmp,data);self.assertEqual(c.skipped,[])
      frames=c.brushes[0]['descriptor']['tip']['animation']['frames'];self.assertEqual(len(frames),5)
      self.assertTrue(all(frame==frames[0] for frame in frames))
      path,_=self.bundle(c,tmp);roundtrip=convert.Catalog(Path(tmp)/'roundtrip');convert.portable_bundle(path,roundtrip)
      self.assertEqual(roundtrip.brushes,c.brushes)
 def imported(self,tmp,data,*,engine='paintbrush',application=0,extra='',scale=2):
    path=Path(tmp)/'Own.kpp';path.write_bytes(kpp('<Brush type="gbr_brush" filename="own.gih" brushApplication="%d" scale="%s" ratio=".5" spacing=".2"/>'%(application,scale),resources=extra,engine=engine))
    c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'own.gih':data});return c,path
 def source_bytes(self,c,aid,w,h):
    asset=c.assets[aid];side=asset['size'];raw=(c.output/asset['file']).read_bytes();x=(side-w)//2;y=(side-h)//2
    return bytes(raw[(row+y)*side+x+col]for row in range(h)for col in range(w))
 def bundle(self,c,tmp):
    library=c.write();data={'library':library,'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}}
    p=Path(tmp)/'own.grafetto-brushes.json';p.write_text(json.dumps(data));return p,data
 def test_l_frames_keep_original_bytes_first_metrics_and_each_own_asset_side(self):
    with tempfile.TemporaryDirectory()as tmp:
      first=bytes(range(8));second=bytes(range(48));c,_=self.imported(tmp,pipe([frame(4,2,first),frame(8,6,second)]))
      self.assertEqual(c.skipped,[]);b=c.brushes[0];d=b['descriptor'];t=d['tip'];g=t['animation']['geometry']
      self.assertEqual(d['version'],86);self.assertEqual(b['sourceDefaults']['sizePx'],8)
      self.assertEqual(d['behavior']['spacing']['axisScale'],{'x':1,'y':.5});self.assertEqual(t['aspect'],2)
      self.assertEqual([(r['sourceWidth'],r['sourceHeight'])for r in g['frames']],[(4,2),(8,6)])
      self.assertEqual([c.assets[aid]['size']for aid in t['animation']['frames']],[4,8])
      self.assertEqual(self.source_bytes(c,t['animation']['frames'][0],4,2),first)
      self.assertEqual(self.source_bytes(c,t['animation']['frames'][1],8,6),second)
      self.assertNotIn('color',t);self.assertNotIn('imageSampling',t)
 def test_rgba_original_planes_use_their_frame_bounds_not_first_frame_bounds(self):
    with tempfile.TemporaryDirectory()as tmp:
      first=rgba(4,2);second=rgba(8,5);c,_=self.imported(tmp,pipe([frame(4,2,first,4),frame(8,5,second,4)]),application=1)
      self.assertEqual(c.skipped,[]);t=c.brushes[0]['descriptor']['tip'];g=t['animation']['geometry'];self.assertEqual(c.brushes[0]['descriptor']['version'],86)
      self.assertEqual(g['frames'][1]['maskBounds'],{'x':.25,'y':.21875,'width':.5,'height':.5})
      for index,(w,h,raw)in enumerate([(4,2,first),(8,5,second)]):
        self.assertEqual(self.source_bytes(c,t['animation']['frames'][index],w,h),raw[3::4])
        for channel,aid in enumerate(t['color']['frames'][index]):self.assertEqual(self.source_bytes(c,aid,w,h),raw[channel::4])
      self.assertNotEqual(g['frames'][0]['maskBounds'],g['frames'][1]['maskBounds'])
 def test_texture_identity_can_alias_while_original_frame_geometry_differs(self):
    with tempfile.TemporaryDirectory()as tmp:
      a=bytearray(4*2*4);a[(1*4+1)*4+3]=128
      b=bytearray(4*4*4);b[(2*4+1)*4+3]=128
      c,_=self.imported(tmp,pipe([frame(4,2,a,4),frame(4,4,b,4)]),application=1)
      self.assertEqual(c.skipped,[]);t=c.brushes[0]['descriptor']['tip']
      self.assertEqual(t['animation']['frames'][0],t['animation']['frames'][1]);self.assertEqual(t['color']['frames'][0],t['color']['frames'][1])
      self.assertEqual([r['sourceHeight']for r in t['animation']['geometry']['frames']],[2,4])
 def test_random_and_exact_eof_short_pipe_keep_actual_frame_order(self):
    with tempfile.TemporaryDirectory()as tmp:
      c,_=self.imported(tmp,pipe([frame(2,2,[64]*4),frame(4,2,[192]*8)],mode='random',declared=3))
      self.assertEqual(c.skipped,[]);t=c.brushes[0]['descriptor']['tip'];self.assertEqual(t['animation']['mode'],'random');self.assertEqual(len(t['animation']['geometry']['frames']),2)
      self.assertTrue(any(n['feature']=='gihFrameCount'for n in c.brushes[0]['compatibility']))
 def test_oversized_and_unpaddable_originals_are_rejected_instead_of_resized(self):
    for w in [2048,2049]:
      with self.subTest(w=w),tempfile.TemporaryDirectory()as tmp:
        c,_=self.imported(tmp,pipe([frame(2,2,[255]*4),frame(w,1,[128]*w)]));self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)
        self.assertRegex(c.skipped[0]['reasons'][0],'2048|padding')
 def test_unequal_material_or_mixer_is_explicitly_unsupported(self):
    for engine,app in [('paintbrush',2),('colorsmudge',1)]:
      with self.subTest(engine=engine,app=app),tempfile.TemporaryDirectory()as tmp:
        c,_=self.imported(tmp,pipe([frame(2,2,rgba(2,2),4),frame(4,2,rgba(4,2),4)]),engine=engine,application=app)
        self.assertEqual(c.brushes,[]);self.assertIn('unsupported',c.skipped[0]['reasons'][0])
 def test_same_size_rgba_descriptor_and_assets_are_exactly_baseline84(self):
    with tempfile.TemporaryDirectory()as tmp:
      data=pipe([frame(4,2,rgba(4,2),4),frame(4,2,rgba(4,2),4)])
      c,path=self.imported(tmp,data,application=1)
      spec=importlib.util.spec_from_file_location('baseline_variable_gih',ACTUAL);baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
      prior=convert.Catalog(Path(tmp)/'prior');baseline.convert_krita(path,prior,{'own.gih':data})
      self.assertEqual(c.skipped,[]);self.assertEqual(c.brushes,prior.brushes);self.assertEqual(c.brushes[0]['descriptor']['version'],84)
      self.assertNotIn('geometry',c.brushes[0]['descriptor']['tip']['animation']);self.assertEqual(c.assets,prior.assets)
      for aid in c.assets:self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),(prior.output/prior.assets[aid]['file']).read_bytes())
 def test_portable_roundtrip_preserves_geometry_and_rgba_without_new_pixels(self):
    with tempfile.TemporaryDirectory()as tmp:
      c,_=self.imported(tmp,pipe([frame(4,2,rgba(4,2),4),frame(8,5,rgba(8,5),4)]),application=1)
      self.assertEqual(c.skipped,[]);p,_=self.bundle(c,tmp);out=convert.Catalog(Path(tmp)/'portable');convert.portable_bundle(p,out)
      self.assertEqual(c.brushes,out.brushes);self.assertEqual(c.assets,out.assets)
 def test_portable_rejects_bad_geometry_before_writing_any_cas(self):
    with tempfile.TemporaryDirectory()as tmp:
      c,_=self.imported(tmp,pipe([frame(4,2,rgba(4,2),4),frame(8,5,rgba(8,5),4)]),application=1);self.assertEqual(c.skipped,[])
      p,data=self.bundle(c,tmp)
      changes=[lambda d:d.update(version=84),lambda d:d['tip']['animation']['geometry']['frames'][1].update(sourceWidth=17),lambda d:d['tip']['animation']['geometry']['frames'][1]['maskBounds'].update(x=-0.0),lambda d:d['tip']['animation']['geometry']['frames'].pop(),lambda d:d['tip']['color']['frames'][1].__setitem__(0,d['tip']['color']['planes'][0]),lambda d:d['tip']['animation']['geometry'].update(extra=True),lambda d:d['tip']['animation']['geometry']['frames'][0].update(sourceHeight=True)]
      for index,change in enumerate(changes):
        bad=copy.deepcopy(data);change(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(index)))
        with self.subTest(index=index),self.assertRaisesRegex(ValueError,'GIH'):convert.portable_bundle(p,out)
        self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])

 def test_portable_plain_parent_cannot_smuggle_a_variable_grayscale_child(self):
    with tempfile.TemporaryDirectory()as tmp:
      c,_=self.imported(tmp,pipe([frame(4,2,range(8)),frame(8,6,range(48))]));self.assertEqual(c.skipped,[])
      p,data=self.bundle(c,tmp);d=data['library']['brushes'][0]['descriptor'];child=copy.deepcopy(d)
      d['tip']={'kind':'round','hardness':1,'aspect':1,'angle':0,'rotation':'fixed'}
      d.setdefault('behavior',{})['dual']={'brush':child,'sampling':'independent','blendMode':'multiply'}
      p.write_text(json.dumps(data));out=convert.Catalog(Path(tmp)/'nested')
      with self.assertRaisesRegex(ValueError,'Variable GIH child'):convert.portable_bundle(p,out)
      self.assertEqual(list(out.output.iterdir()),[])

 def test_variable_gih_guard_rejects_every_non_pixel_family(self):
    from variable_gih import validate_variable_gih_descriptor
    with tempfile.TemporaryDirectory()as tmp:
      c,_=self.imported(tmp,pipe([frame(4,2,range(8)),frame(8,6,range(48))]));self.assertEqual(c.skipped,[])
      d=c.brushes[0]['descriptor'];sizes={aid:asset['size']for aid,asset in c.assets.items()}
      validate_variable_gih_descriptor(d,sizes)
      for family in ['spray','sketch','bristle','curveTrace','hatching','grid','particle','experiment','deform','filter','clone','mypaint','tangentNormal']:
        bad=copy.deepcopy(d);bad[family]={}
        with self.subTest(family=family),self.assertRaisesRegex(ValueError,'Unsupported variable GIH geometry combination'):validate_variable_gih_descriptor(bad,sizes)
