from pathlib import Path
import unittest,tempfile,json,copy,subprocess
from test_texture_lightness108 import fixture,portable
from brush_contract import Catalog
from convert import portable_bundle
from krita_import import preset
PIN='c40ee26cafc9097c2865b42fab974a9311a0ee9d'
class TextureWash171Tests(unittest.TestCase):
 def test_native_rgba_planes_and_portable_whole_record(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,m,_=fixture(Path(tmp),{'PaintOpAction':'2','Texture/Strength/Value':'.75','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'});d=m['brushes'][0]['descriptor'];self.assertEqual(d['version'],171);self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');self.assertEqual(d['texture']['material']['kind'],'lightness');self.assertEqual((c.output/c.assets[d['texture']['material']['alpha']]['file']).read_bytes(),bytes([0,128,255,255]));env,out=portable(Path(tmp),c,m);self.assertEqual(out.brushes,m['brushes'])
   for kind in('version','gradient','timer','erase','dual','rgb','array','mismatch','missing'):
    bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
    if kind=='version':b['version']=108
    elif kind=='gradient':b['texture']['material']['kind']='gradient'
    elif kind=='timer':b['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif kind=='erase':b['behavior']['erase']=True
    elif kind=='dual':b['behavior']['dual']={'brush':copy.deepcopy(b),'blendMode':'multiply','sampling':'independent'}
    elif kind=='rgb':b['tip']['color']={'planes':[b['tip']['mask']]*3}
    elif kind=='array':b['behavior']['modulations']['grainDepth'][0]['control']=['pressure']
    elif kind=='mismatch':b['texture']['patternSize']['width']=9999
    else:b['texture']['material']['alpha']='asset:'+'f'*64
    path=Path(tmp)/(kind+'.json');path.write_text(json.dumps(bad));out=Catalog(Path(tmp)/kind)
    with self.subTest(kind=kind),self.assertRaises(ValueError):portable_bundle(path,out)
    self.assertFalse(out.brushes);self.assertFalse(out.assets);self.assertEqual(list(out.output.iterdir()),[])
 def test_native_active_timer_erase_and_random_outside_scope_reject(self):
  for values in[{'PaintOpSettings/isAirbrushing':'true'},{'AirbrushOption/isAirbrushing':'true'},{'Krita/erase':'true'},{'Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="fuzzy"/>'}]:
   with self.subTest(values=values),tempfile.TemporaryDirectory()as tmp,self.assertRaises(ValueError):fixture(Path(tmp),{'PaintOpAction':'2',**values})
 def test_old108_111_whole_records_equal_pinned_producer(self):
  ns={'__name__':'oldproducer'};src=subprocess.check_output(['git','show',PIN+':scripts/brush-import/krita_import.py']);exec(compile(src,'pinned-krita.py','exec'),ns)
  # fixture resolver bytes are deterministic; capture the exact resolver using
  # the existing producer callback rather than inventing resource identities.
  import test_texture_lightness108 as f
  for mode in('2','3'):
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);capture={};real=f.preset
    def producer(raw,name,catalog,resources):capture.update(raw=raw,name=name,resources=resources);return real(raw,name,catalog,resources)
    f.preset=producer
    try:c,m,_=f.fixture(root,{'Texture/Pattern/TexturingMode':mode})
    finally:f.preset=real
    old=ns['preset'](capture['raw'],capture['name'],Catalog(root/'old'),capture['resources']);self.assertEqual(m['brushes'][0],old)
if __name__=='__main__':unittest.main()
