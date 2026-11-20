from pathlib import Path
import unittest,tempfile,json,copy
from test_texture_lightness108 import fixture,portable
from brush_contract import Catalog
from convert import portable_bundle
from texture_gradient_wash180 import texture_gradient_wash180_scope
class TextureGradientWash180Tests(unittest.TestCase):
 def test_native_actualpattern_planes_and_portable_whole(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c,m,_=fixture(root,{'PaintOpAction':'2','Texture/Pattern/TexturingMode':'3','Texture/Strength/Value':'.75','Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="pressure"><curve>0,0;1,1;</curve></params>'});b=m['brushes'][0]['descriptor'];self.assertEqual(b['version'],180);self.assertTrue(texture_gradient_wash180_scope(b));self.assertEqual(b['texture']['material']['kind'],'gradient');self.assertEqual(b['behavior']['rendering']['accumulation'],'alphaDarken');self.assertEqual((c.output/c.assets[b['texture']['material']['alpha']]['file']).read_bytes(),bytes([0,128,255,255]));self.assertEqual((c.output/c.assets[b['texture']['id']]['file']).read_bytes(),bytes([255,127,87,39]));env,out=portable(root,c,m);self.assertEqual(out.brushes,m['brushes'])
   for kind in['version','timer','erase','dual','child','RGBA','array','combine','dimensions','missing']:
    bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
    if kind=='version':b['version']=179
    elif kind=='timer':b['behavior']['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif kind=='erase':b['behavior']['erase']=True
    elif kind=='dual':b['behavior']['dual']={'brush':copy.deepcopy(b),'blendMode':'multiply','sampling':'independent'}
    elif kind=='child':child=copy.deepcopy(b);b.pop('texture');b['behavior']['dual']={'brush':child,'blendMode':'multiply','sampling':'independent'}
    elif kind=='RGBA':b['tip']['color']={'planes':[b['tip']['mask']]*3}
    elif kind=='array':b['behavior']['modulations']['grainDepth'][0]['control']=['pressure']
    elif kind=='combine':b['behavior']['modulations']['grainDepth'][0]['combine']={}
    elif kind=='dimensions':b['texture']['patternSize']['width']=9999
    else:b['texture']['material']['alpha']='asset:'+'f'*64
    path=root/(kind+'.json');path.write_text(json.dumps(bad));dest=Catalog(root/kind)
    with self.subTest(kind=kind),self.assertRaises(ValueError):portable_bundle(path,dest)
    self.assertFalse(dest.brushes);self.assertFalse(dest.assets);self.assertEqual(list(dest.output.iterdir()),[])
 def test_native_active_options_outsideclosed_scope_reject(self):
  for values in[{'PaintOpSettings/isAirbrushing':'true'},{'AirbrushOption/isAirbrushing':'true'},{'Krita/erase':'true'},{'Texture/Strength/UseCurve':'true','Texture/Strength/Sensor':'<params id="fuzzy"/>'},{'Texture/Pattern/AutoInvertOnErase':'true'}]:
   with self.subTest(values=values),tempfile.TemporaryDirectory()as tmp,self.assertRaises(ValueError):fixture(Path(tmp),{'PaintOpAction':'2','Texture/Pattern/TexturingMode':'3',**values})
