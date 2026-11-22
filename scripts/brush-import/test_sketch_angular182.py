import unittest,tempfile,struct,json,base64,copy,io,hashlib,os
from pathlib import Path
from PIL import Image,PngImagePlugin
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
from sketch_gih182 import sketch_angular_gih182_scope

def pipe182(mode='angular',count=4,unequal=False,channels=1):
 frames=[]
 for i in range(count):
  w=3 if unequal and i==1 else 4;h=4;label=b'Own182 alpha\0';alpha=bytes(255 if x==i%4 else 0 for y in range(h)for x in range(w));pixels=alpha if channels==1 else bytes(c for a in alpha for c in(12,90,220,a));frames.append(struct.pack('>7I',28+len(label),2,w,h,channels,0x47494d50,25)+label+pixels)
 return('Own angular Sketch182\n'+str(count)+' dim:1 rank0:'+str(count)+' sel0:'+mode+'\n').encode()+b''.join(frames)

def make182(root,raw=None,extra=''):
 sensor='<params id="pressure"><curve>0,0;1,1;</curve></params>'
 params={'brush_definition':('<Brush type="gbr_brush" filename="Own182.gih" scale="1" ColorAsMask="1"/>','string'),'CompositeOp':('normal','string'),'SizeUseCurve':('true','bool'),'SizeSensor':(sensor,'string'),'PressureSize':('true','bool'),'Sketch/simpleMode':('false','bool')}
 xml='<Preset name="Own182 Angular Sketch" paintopid="sketchbrush">'+('' if 'name="PaintOpAction"' in extra else '<param name="PaintOpAction">1</param>')+''.join('<param name="'+k+'" type="'+t+'"><![CDATA['+v+']]></param>'for k,(v,t)in params.items())+extra+'</Preset>'
 im=Image.new('RGBA',(16,16),(255,255,255,255));meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0');meta.add_text('preset',xml);out=io.BytesIO();im.save(out,format='PNG',pnginfo=meta);data=out.getvalue();c=Catalog(root);result=preset(data,'Own182.kpp',c,{'Own182.gih':pipe182()if raw is None else raw});c.brushes.append(result);return result,c,data
class Angular182(unittest.TestCase):
 def test_genuine_typed_kpp_gih_literal_alpha_order_and_portable_whole(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);record,c,raw=make182(p/'native');d=record['descriptor'];self.assertEqual(d['version'],182);self.assertTrue(sketch_angular_gih182_scope(d));self.assertEqual(d['tip']['animation']['mode'],'angular');self.assertEqual(d['tip']['animation']['cursorPolicy'],'first-request-v1');self.assertEqual(d['tip']['animation']['rank'],4);self.assertEqual(d['behavior']['strokeInput'],{'version':1,'initialDirection':'cursorHistory'});self.assertEqual(d['sketch']['maskSize'],[4,4]);integral=copy.deepcopy(d);integral['version']=182.0;integral['tip']['animation']['rank']=4.0;integral['behavior']['strokeInput']['version']=1.0;self.assertTrue(sketch_angular_gih182_scope(integral))
   for i,aid in enumerate(d['tip']['animation']['frames']):self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes(255 if x==i else 0 for y in range(4)for x in range(4)))
   m=c.write();env={'library':m,'assets':{a:base64.b64encode((c.output/v['file']).read_bytes()).decode()for a,v in c.assets.items()}};f=p/'input.json';f.write_text(json.dumps(env));dest=Catalog(p/'portable');portable_bundle(f,dest);self.assertEqual(dest.brushes,c.brushes);self.assertEqual(dest.assets,c.assets)
   for key in['old','rank','rankBool','modeArray','cursor','input','fan','child','dual','timer','RGBA','unequal','missing','sizeRandom']:
    bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor'];a=b['tip']['animation']
    if key=='old':b['version']=181
    elif key=='rank':a['rank']=3
    elif key=='rankBool':a['rank']=True
    elif key=='modeArray':a['mode']=['angular']
    elif key=='cursor':a.pop('cursorPolicy')
    elif key=='input':b['behavior'].pop('strokeInput')
    elif key=='fan':b['behavior']['strokeInput']['fanCorners']={'stepDegrees':30}
    elif key in('child','dual'):
     child=copy.deepcopy(b)
     if key=='child':b.pop('sketch');b['tip'].pop('animation');b['behavior'].pop('strokeInput')
     b['behavior']['dual']={'brush':child,'blendMode':'multiply','sampling':'independent'}
    elif key=='timer':b['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif key=='RGBA':b['tip']['color']={}
    elif key=='unequal':bad['library']['assets'][2]['size']=8
    elif key=='missing':bad['library']['assets'].pop()
    else:b['behavior']['modulations']={'size':[{'control':'random','minimum':0,'jitter':0}]}
    f.write_text(json.dumps(bad));out=Catalog(p/key)
    with self.subTest(key=key),self.assertRaises(ValueError):portable_bundle(f,out)
    self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{})
   save=os.environ.get('ANGULAR182_ARTIFACTS')
   if save:
    target=Path(save);target.mkdir();(target/'Own182.kpp').write_bytes(raw);(target/'Own182.gih').write_bytes(pipe182());(target/'manifest.json').write_text(json.dumps(m,indent=2));(target/'literal-proof.json').write_text(json.dumps({'authored':True,'stockGain':0,'KPP':hashlib.sha256(raw).hexdigest(),'GIH':hashlib.sha256(pipe182()).hexdigest(),'CASCount':len(c.assets),'CASBytes':sum((c.output/v['file']).stat().st_size for v in c.assets.values()),'id':d['id'],'portableWholeEqual':True},indent=2))
 def test_closed_native_otherselectors_unequal_rgba_timer_dual_wash_reject(self):
  for raw,extra in[(pipe182('random'),''),(pipe182('velocity'),''),(pipe182('xtilt'),''),(pipe182(unequal=True),''),(pipe182(channels=4),''),(pipe182(),'<param name="PaintOpSettings/isAirbrushing">true</param>'),(pipe182(),'<param name="AirbrushOption/isAirbrushing">true</param>'),(pipe182(),'<param name="MaskingBrush/Enabled">true</param>'),(pipe182(),'<param name="PaintOpAction">2</param>')]:
   with tempfile.TemporaryDirectory()as t,self.assertRaises(ValueError):make182(Path(t),raw,extra)
 def test_old174181_whole_records_assets_unchanged(self):
  from test_sketch_pressure181 import make181
  from test_sketch_gih174 import SketchGih174Tests
  expected=json.loads(Path(os.environ['ANGULAR182_OLD_RECORDS']).read_text())
  with tempfile.TemporaryDirectory()as t:
   _,a,c=SketchGih174Tests().make(Path(t)/'174');b,d=make181(Path(t)/'181')
   self.assertEqual(a,expected['174']['record']);self.assertEqual(b,expected['181']['record'])
   for version,catalog in[('174',c),('181',d)]:self.assertEqual({k:hashlib.sha256((catalog.output/v['file']).read_bytes()).hexdigest()for k,v in catalog.assets.items()},expected[version]['assets'])
