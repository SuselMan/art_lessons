import unittest,tempfile,struct,json,base64,copy,subprocess,io
from pathlib import Path
from PIL import Image
import xml.etree.ElementTree as ET
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle
PIN='11994a02dd85ab7eb0f1785a3a4cfd8ac2fa86fe'
def pipe174(mode='incremental',dims=(4,4),count=2):
 def frame(right,w,h):
  label=b'Own alpha174\0';data=bytes(255 if(x>=w//2)==right else 0 for y in range(h)for x in range(w));return struct.pack('>7I',28+len(label),2,w,h,1,0x47494d50,25)+label+data
 return('Own incremental alpha\n'+str(count)+' dim:1 rank0:'+str(count)+' sel0:'+mode+'\n').encode()+frame(False,4,4)+frame(True,*dims)
class SketchGih174Tests(unittest.TestCase):
 def make(self,root,rawpipe=None,extra=''):
  data=kpp('<Brush type="gbr_brush" filename="own174.gih" scale="1" ColorAsMask="1"/>',engine='sketchbrush',resources=extra);rawpipe=pipe174()if rawpipe is None else rawpipe;c=Catalog(root);b=preset(data,'own174.kpp',c,{'own174.gih':rawpipe});c.brushes.append(b);return data,b,c
 def test_genuine_format_native_retains_framebytes_rank_order_and_portable_whole_record(self):
  with tempfile.TemporaryDirectory()as tmp:
   raw,b,c=self.make(Path(tmp)/'in');d=b['descriptor'];self.assertEqual(d['version'],174);self.assertEqual(d['sketch']['maskSignal'],'gih-alpha-v1');self.assertEqual(d['sketch']['maskSize'],[4,4]);a=d['tip']['animation'];self.assertEqual(a['mode'],'incremental');self.assertEqual(len(a['frames']),2);self.assertEqual(len(c.assets),2)
   for right,aid in enumerate(a['frames']):self.assertEqual((c.output/c.assets[aid]['file']).read_bytes(),bytes(255 if(x>=2)==bool(right)else 0 for y in range(4)for x in range(4)))
   m=c.write();env={'library':m,'assets':{x['id']:base64.b64encode((c.output/x['file']).read_bytes()).decode()for x in m['assets']}};p=Path(tmp)/'p.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'good');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
   for kind in['version','random','array','sensor','mask','timer','erase','size','sizeRandom','sizeArray','sizeOvershoot','missing']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
    if kind=='version':d['version']=173
    elif kind=='random':d['tip']['animation']['mode']='random'
    elif kind=='array':d['tip']['animation']['mode']=['incremental']
    elif kind=='sensor':d['tip']['animation']['mode']='pressure'
    elif kind=='mask':d['tip']['mask']=d['tip']['animation']['frames'][1]
    elif kind=='timer':d['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif kind=='erase':d['behavior']['erase']=True
    elif kind=='size':d['sketch']['maskSize']=[3,4]
    elif kind=='sizeRandom':d['behavior']['modulations']={'size':[{'control':'random','minimum':0,'jitter':0}]}
    elif kind=='sizeArray':d['behavior']['modulations']={'size':[{'control':['pressure'],'minimum':0,'jitter':0}]}
    elif kind=='sizeOvershoot':d['sizeByPressure']=[[0,1],[1,2]]
    else:bad['library']['assets'].pop();bad['assets'].pop(list(bad['assets'])[-1])
    p.write_text(json.dumps(bad));o=Catalog(Path(tmp)/kind)
    with self.subTest(kind=kind),self.assertRaises(ValueError):portable_bundle(p,o)
    self.assertFalse(o.brushes);self.assertFalse(o.assets);self.assertEqual(list(o.output.iterdir()),[])
 def test_native_other_modes_unequal_declared_count_timer_do_not_fallback(self):
  for data,extra in[(pipe174('random'),''),(pipe174(dims=(3,4)),''),(pipe174(count=3),''),(pipe174(),'<param name="PaintOpSettings/isAirbrushing">true</param>'),(pipe174(),'<param name="PaintOpAction">2</param>'),(pipe174(),'<param name="PressureSize">true</param><param name="SizeSensor"><![CDATA[<params id="unknown-active-size"/>]]></param>'),(pipe174(),'<param name="PressureSize">true</param><param name="SizeSensor"><![CDATA[<params id="fuzzy"/>]]></param>')]:
   with tempfile.TemporaryDirectory()as tmp,self.assertRaises(ValueError):self.make(Path(tmp),data,extra)
 def test_old173_whole_native_record_equal_pinned_adapter(self):
  ns={'__name__':'old'};exec(compile(subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_sketch.py']),'old.py','exec'),ns)
  definition='<Brush type="auto_brush" density="1" randomness="0"><MaskGenerator id="default" type="rect" diameter="16" ratio=".5" hfade="1" vfade="1" spikes="2"/></Brush>';raw=kpp(definition,engine='sketchbrush');im=Image.open(io.BytesIO(raw));root=ET.fromstring(im.info['preset']);params={n.get('name'):n.text for n in root.findall('param')}
  with tempfile.TemporaryDirectory()as tmp:
   a=preset(raw,'old173.kpp',Catalog(Path(tmp)/'a'),{});old=ns['sketch_preset'](raw,root,params,'old173.kpp',Catalog(Path(tmp)/'b'),{},lambda x:None);self.assertEqual(a,old)
if __name__=='__main__':unittest.main()
