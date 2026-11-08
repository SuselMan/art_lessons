"""Authored bounded native-format fixture, not original Sumi-e identity proof."""
from pathlib import Path
import io,json,struct,copy,base64,tempfile,unittest
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita
from convert import portable_bundle
from bristle_wash135 import bristle_wash135_scope
SETTINGS=json.loads((Path(__file__).parent/'fixtures/bristle_wash135_controls.json').read_text())['params']
NAME=b'own\0';GBR=struct.pack('>7I',28+len(NAME),2,4,4,1,0x47494d50,25)+NAME+bytes([255,255,128,0,255,128,255,255,255,255,64,255,255,255,255,255])
def authored(action='2',extra=None):
 params={**SETTINGS,'PaintOpAction':action,'HairyBristle/density':'100',**(extra or{})};params['brush_definition']='<Brush type="gbr_brush" filename="own.gbr" scale="1" angle="0" ColorAsMask="1"/>'
 root=ET.Element('Preset',{'paintopid':'hairybrush','name':'Own no-ink Bristle Wash135'})
 for key,value in params.items():ET.SubElement(root,'param',{'name':key}).text=value
 info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();Image.new('RGB',(2,2),'red').save(out,format='PNG',pnginfo=info);return out.getvalue()
class BristleWash135(unittest.TestCase):
 def native(self,tmp,action='2',extra=None):
  raw=authored(action,extra);path=Path(tmp)/'Own.kpp';path.write_bytes(raw);c=Catalog(Path(tmp)/'native');convert_krita(path,c,{'own.gbr':GBR});self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);return c,raw
 def test_new135_and_new141_share_hairs_size_rotation_curves_but_different_request_law(self):
  rows=[]
  for action,version,law in[('2',135,'alphaDarken'),('1',141,'directOver')]:
   with tempfile.TemporaryDirectory()as tmp:
    c,raw=self.native(tmp,action);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['behavior']['rendering']['accumulation'],law);self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);self.assertEqual(bristle_wash135_scope(d),action=='2');self.assertTrue(c.assets);rows.append(copy.deepcopy(d));self.assertTrue(all((c.output/v['file']).stat().st_size==v['size']**2 for v in c.assets.values()))
  self.assertEqual(rows[1]['bristle'].pop('initialization'),{'sourceSide':4,'resizePolicy':'mask-population-v1'})
  for key in('bristle','sizeByPressure','opacityByPressure','tip'):self.assertEqual(rows[0][key],rows[1][key])
  self.assertEqual(rows[0]['bristle']['scale'],1.03);self.assertEqual(rows[0]['bristle']['random'],7.47);self.assertTrue(rows[0]['bristle']['antialias']);self.assertFalse(rows[0]['bristle']['compositing'])
 def test_portable_shared_scope_negatives_before_any_published_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(path,good);self.assertEqual(good.brushes,c.brushes)
   for case in('revision','ink','aa','compositing','timer','child','dual','texture','erase','fan','pigment','flow','hairs','opacityDynamic'):
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];b=d['behavior'];h=d['bristle']
    if case=='revision':d['version']=134
    elif case=='ink':h['version']=2
    elif case=='aa':h['antialias']=False
    elif case=='compositing':h['compositing']=True
    elif case=='timer':b['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif case=='child':
     child=copy.deepcopy(d);d.pop('bristle');d['version']=27;b['rendering']['accumulation']='directOver';b['dual']={'brush':child,'sampling':'independent','blendMode':'subtract'}
    elif case=='dual':b['dual']={}
    elif case=='texture':d['texture']=None
    elif case=='erase':b['erase']=True
    elif case=='fan':b['strokeInput']={'version':1,'initialDirection':'cursorHistory','fanCorners':{}}
    elif case=='pigment':b['colorAdjustment']={}
    elif case=='flow':d['flow']=.5
    elif case=='hairs':h['hairs']=[[1,0,1]]
    else:b.setdefault('modulations',{})['opacity']=[]
    path.write_text(json.dumps(e));bad=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(path,bad)
    self.assertEqual(bad.brushes,[]);self.assertEqual(bad.assets,{});self.assertEqual(list(bad.output.iterdir()),[])
 def test_native_wrong_branches_skip_without_published_source_assets(self):
  for change in({'HairyInk/enabled':'true','HairyInk/inkAmount':'4'},{'HairyBristle/antialias':'false'},{'HairyBristle/useCompositing':'true'},{'Krita/erase':'true'},{'PaintOpSettings/isAirbrushing':'true'}):
   with tempfile.TemporaryDirectory()as tmp:
    file=Path(tmp)/'Own.kpp';file.write_bytes(authored(extra=change));c=Catalog(Path(tmp)/'bad');convert_krita(file,c,{'own.gbr':GBR});self.assertTrue(c.skipped);self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{});self.assertEqual(list(c.output.iterdir()),[])
