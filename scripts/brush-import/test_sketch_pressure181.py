import unittest,tempfile,struct,json,base64,copy
from pathlib import Path
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle,validate_portable_profile
from sketch_gih181 import sketch_pressure_gih181_scope

def pipe181(mode='pressure',count=3,unequal=False,channels=1):
 frames=[]
 for i in range(count):
  w=3 if unequal and i==1 else 4;h=4;label=b'Own181\0';alpha=bytes(255 if(x==(i%4))else 0 for y in range(h)for x in range(w));raw=alpha if channels==1 else bytes(c for a in alpha for c in(12,90,220,a));frames.append(struct.pack('>7I',28+len(label),2,w,h,channels,0x47494d50,25)+label+raw)
 return('Own pressure alpha\n'+str(count)+' dim:1 rank0:'+str(count)+' sel0:'+mode+'\n').encode()+b''.join(frames)

def make181(root,raw=None,extra=''):
 data=kpp('<Brush type="gbr_brush" filename="own181.gih" scale="1" ColorAsMask="1"/>',engine='sketchbrush',resources=extra);c=Catalog(root);b=preset(data,'own181.kpp',c,{'own181.gih':pipe181()if raw is None else raw});c.brushes.append(b);return b,c
class Pressure181(unittest.TestCase):
 def test_genuine_pressure_rank_alpha_and_portable_whole(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);b,c=make181(p/'native');d=b['descriptor'];self.assertTrue(sketch_pressure_gih181_scope(d));self.assertEqual(d['version'],181);self.assertEqual(d['tip']['animation']['mode'],'pressure');self.assertEqual(d['tip']['animation']['rank'],3)
   for i,aid in enumerate(d['tip']['animation']['frames']):self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes(255 if x==i else 0 for y in range(4)for x in range(4)))
   env={'library':c.write(),'assets':{a:base64.b64encode((c.output/v['file']).read_bytes()).decode()for a,v in c.assets.items()}};f=p/'own.grafetto-brushes.json';f.write_text(json.dumps(env));out=Catalog(p/'portable');portable_bundle(f,out);self.assertEqual(out.brushes,c.brushes);self.assertEqual(out.assets,c.assets)
   for key in('rank','rankBool','old','modeArray','timer','color','missing','physical'):
    bad=copy.deepcopy(env);x=bad['library']['brushes'][0]['descriptor']
    if key=='rank':x['tip']['animation']['rank']=2
    elif key=='rankBool':x['tip']['animation']['rank']=True
    elif key=='old':x['version']=180
    elif key=='modeArray':x['tip']['animation']['mode']=['pressure']
    elif key=='timer':x['behavior']['timing']={}
    elif key=='color':x['tip']['color']={}
    elif key=='missing':bad['library']['assets'].pop()
    else:bad['library']['assets'][0]['size']=8
    f.write_text(json.dumps(bad));dest=Catalog(p/key)
    with self.subTest(key=key),self.assertRaises(ValueError):portable_bundle(f,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
 def test_native_unequal_rgba_otherselectors_timer_remain_closed(self):
  for raw,extra in[(pipe181(unequal=True),''),(pipe181(channels=4),''),(pipe181('random'),''),(pipe181('velocity'),''),(pipe181(),'<param name="PaintOpSettings/isAirbrushing">true</param>'),(pipe181(),'<param name="PaintOpAction">2</param>')]:
   with tempfile.TemporaryDirectory()as t,self.assertRaises(ValueError):make181(Path(t),raw,extra)
 def test_old174_and162_whole_records_unchanged(self):
  import test_sketch_gih174 as old174,test_sketch_image_alpha162 as old162
  expected=json.loads(Path(__file__).with_name('pre181-records.json').read_text())
  with tempfile.TemporaryDirectory()as t:
   _,b,_=old174.SketchGih174Tests().make(Path(t));self.assertEqual(b,expected['174'])
  fixture=old162.SketchImageAlpha162Tests();fixture.setUp()
  try:b,_,_=fixture.make();self.assertEqual(b,expected['162'])
  finally:fixture.tearDown()
