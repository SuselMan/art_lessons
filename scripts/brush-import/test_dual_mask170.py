import unittest,tempfile,copy,json,subprocess,io,base64
from pathlib import Path
from PIL import Image
from test_krita import kpp
from test_dual_mask168 import DualMask168Tests
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
PIN='801fef21bdf5f93ca936330482ee52a4bc65d49c'
class DualMask170Tests(unittest.TestCase):
 def raw(self,mode='hard_mix_photoshop',extra='',bitmap=False):
  definition='<Brush type="png_brush" filename="tip.png" brushApplication="0"/>'if bitmap else None
  return kpp(definition,resources='<param name="PressureSize">true</param><param name="PaintOpAction">1</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MaskingCompositeOp">'+mode+'</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush" spacing="0.2" angle="0"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>]]></param>'+extra)
 def test_native_auto_bitmap_and_portable_closed_before_outputs(self):
  for bitmap in(False,True):
   with self.subTest(bitmap=bitmap),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);buf=io.BytesIO();Image.new('RGBA',(2,2),(255,255,255,128)).save(buf,format='PNG');c=Catalog(root/'src');b=preset(self.raw(bitmap=bitmap),'own170.kpp',c,{'tip.png':buf.getvalue()});d=b['descriptor'];self.assertEqual(d['version'],170);self.assertEqual(d['behavior']['dual']['blendMode'],'hardMixPhotoshopAlpha');self.assertEqual(d['behavior']['dual']['sampling'],'independent');self.assertNotEqual(d['sizeByPressure'],[[0,1],[1,1]]);self.assertTrue(any(n['feature']=='masking.alphaHardMixPhotoshop170'and n['status']=='supported'for n in b['compatibility']));c.brushes.append(b)
    env={'library':c.write(),'assets':{aid:base64.b64encode((c.output/a['file']).read_bytes()).decode()for aid,a in c.assets.items()}};path=root/'portable.json';path.write_text(json.dumps(env));out=Catalog(root/'good');portable_bundle(path,out);self.assertEqual(out.brushes,[b]);self.assertEqual(out.assets,c.assets)
    for mode in('version','erase','timer','inline','array','nested','childRGB','rootWash'):
     bad=copy.deepcopy(env);v=bad['library']['brushes'][0]['descriptor']
     if mode=='version':v['version']=168
     elif mode=='erase':v['behavior']['erase']=True
     elif mode=='timer':v['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
     elif mode=='inline':v['behavior']['dual']['sampling']='inline'
     elif mode=='array':v['behavior']['modulations']={'size':[{'control':['pressure'],'minimum':0,'jitter':0,'curve':[[0,0],[1,1]]}]}
     elif mode=='nested':v['behavior']['dual']['brush']['behavior']['dual']=copy.deepcopy(v['behavior']['dual'])
     elif mode=='rootWash':v['behavior']['rendering']['accumulation']='alphaDarken'
     else:v['behavior']['dual']['brush']['tip']['color']={'planes':['asset:'+'a'*64]*3}
     path.write_text(json.dumps(bad));dest=Catalog(root/mode)
     with self.assertRaises(ValueError,msg=mode):portable_bundle(path,dest)
     self.assertFalse(dest.brushes);self.assertFalse(dest.assets);self.assertEqual(list(dest.output.iterdir()),[])
 def test_native_outside_closed_pair_rejected(self):
  for extra in('<param name="Krita/erase">true</param>','<param name="PaintOpSettings/isAirbrushing">true</param>','<param name="AirbrushOption/isAirbrushing">true</param>','<param name="MaskingBrush/Preset/PaintOpSettings/isAirbrushing">true</param>','<param name="Pressureh">true</param><param name="hSensor"><![CDATA[<params id="pressure"/>]]></param>'):
   with self.subTest(extra=extra),tempfile.TemporaryDirectory()as tmp,self.assertRaises(ValueError):preset(self.raw(extra=extra),'outside.kpp',Catalog(Path(tmp)/'out'),{})
 def test_oldfive_and168_whole_records_equal_pinned_producer(self):
  ns={'__name__':'pinned_baseline'};src=subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_import.py']);exec(compile(src,'pinned-krita.py','exec'),ns)
  for mode in('multiply','subtract','darken','overlay','linear_dodge','hard_mix_softer_photoshop'):
   raw=DualMask168Tests().raw(mode)
   with tempfile.TemporaryDirectory()as tmp:
    self.assertEqual(preset(raw,'own.kpp',Catalog(Path(tmp)/'new'),{}),ns['preset'](raw,'own.kpp',Catalog(Path(tmp)/'old'),{}))
 def test_old151_whole_record_equal_pinned_producer(self):
  ns={'__name__':'pinned_baseline'};src=subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_import.py']);exec(compile(src,'pinned-krita.py','exec'),ns)
  buf=io.BytesIO();im=Image.new('RGBA',(2,2));im.putdata([(200,100,50,128),(10,20,30,255),(255,0,0,0),(100,150,200,64)]);im.save(buf,format='PNG');raw=kpp('<Brush type="png_brush" filename="tip.png" brushApplication="1"/>',resources='<param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MaskingCompositeOp">multiply</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA[<Brush type="auto_brush"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>]]></param>')
  with tempfile.TemporaryDirectory()as tmp:
   a=preset(raw,'own151.kpp',Catalog(Path(tmp)/'new'),{'tip.png':buf.getvalue()});b=ns['preset'](raw,'own151.kpp',Catalog(Path(tmp)/'old'),{'tip.png':buf.getvalue()});self.assertEqual(a,b);self.assertEqual(a['descriptor']['version'],151)
if __name__=='__main__':unittest.main()
