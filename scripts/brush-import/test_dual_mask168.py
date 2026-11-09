import unittest,tempfile,copy,json,subprocess,io,xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image
from test_krita import kpp
from krita_import import preset
from brush_contract import Catalog
from convert import portable_bundle
PIN='4b7fdfa43e20873c965d42833992161f05f07f82'
class DualMask168Tests(unittest.TestCase):
 def raw(self,mode='hard_mix_softer_photoshop',extra=''):
  return kpp(resources='<param name="PaintOpAction">1</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MaskingCompositeOp">'+mode+'</param><param name="MaskingBrush/Preset/brush_definition">&lt;Brush type="auto_brush" spacing="0.2" angle="0"&gt;&lt;MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/&gt;&lt;/Brush&gt;</param>'+extra)
 def test_native_mode_and_portable_closed_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp)/'src');b=preset(self.raw(),'own.kpp',c,{});self.assertEqual(b['descriptor']['version'],168);self.assertEqual(b['descriptor']['behavior']['dual']['blendMode'],'hardMixSofterPhotoshop');self.assertFalse(any(n['feature']=='maskingBlend'and n['status']=='unsupported'for n in b['compatibility']));c.brushes.append(b);env={'library':c.write(),'assets':{}};p=Path(tmp)/'input.json';p.write_text(json.dumps(env));out=Catalog(Path(tmp)/'good');portable_bundle(p,out);self.assertEqual(out.brushes,[b])
   for mode in['version','erase','timer','color','nested','array']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
    if mode=='version':d['version']=151
    elif mode=='erase':d['behavior']['erase']=True
    elif mode=='timer':d['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif mode=='color':d['behavior']['dual']['brush']['tip']['color']={'planes':['asset:'+'a'*64]*3}
    elif mode=='array':d['behavior']['modulations']={'size':[{'control':['pressure'],'minimum':0,'jitter':0,'curve':[[0,0],[1,1]]}]}
    else:d['behavior']['dual']['brush']['behavior']['dual']=copy.deepcopy(d['behavior']['dual'])
    p.write_text(json.dumps(bad));out=Catalog(Path(tmp)/mode)
    with self.assertRaises(ValueError):portable_bundle(p,out)
    self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
 def test_old_native_modes_wholeobjects_equal_pinned_producer(self):
  ns={'__name__':'baseline_import'};code=subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_import.py']);exec(compile(code,'krita_import.py','exec'),ns)
  for mode in['multiply','subtract','darken','overlay','linear_dodge']:
   raw=self.raw(mode)
   with tempfile.TemporaryDirectory()as tmp:
    a=preset(raw,'own.kpp',Catalog(Path(tmp)/'new'),{});b=ns['preset'](raw,'own.kpp',Catalog(Path(tmp)/'old'),{});self.assertEqual(json.dumps(a,sort_keys=True),json.dumps(b,sort_keys=True))
if __name__=='__main__':unittest.main()
