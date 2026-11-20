"""Authored native-format derivatives; original KPP separately pinned by CAPS PREP."""
import io,json,copy,base64,tempfile,unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from convert import Catalog,portable_bundle
from krita_import import convert_krita
from brush_contract import finalize_identity
from particle_wash134 import particle_wash134_scope
PARAMS=json.loads((Path(__file__).parent/'fixtures/particle_wash134_controls.json').read_text())['params']
def authored(action='2',extra=None):
 params={**PARAMS,'PaintOpAction':action,**(extra or{})};root=ET.Element('Preset',{'paintopid':'particlebrush','name':'Own Particle Wash134 derivative'})
 for k,v in params.items():ET.SubElement(root,'param',{'name':k}).text=v
 info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(root,encoding='unicode'));out=io.BytesIO();Image.new('RGBA',(2,2),'red').save(out,format='PNG',pnginfo=info);return out.getvalue()
class ParticleWash134(unittest.TestCase):
 def native(self,tmp,action='2',extra=None):
  raw=authored(action,extra);path=Path(tmp)/'Own.kpp';path.write_bytes(raw);c=Catalog(Path(tmp)/'native');convert_krita(path,c);self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),1);return c,raw
 def test_native_Wash134_and_old49_preserve975solver_options_and_original_derivative_identity(self):
  for action,version,law in[('2',134,'alphaDarken'),('1',49,'directOver')]:
   with tempfile.TemporaryDirectory()as tmp:
    c,raw=self.native(tmp,action);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['behavior']['rendering']['accumulation'],law);self.assertEqual(d['particle'],{'version':1,'count':65,'iterations':15,'gravity':.906,'weight':.06,'scaleX':1,'scaleY':1});self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);self.assertEqual(c.assets,{});self.assertEqual(particle_wash134_scope(d),action=='2')
 def test_portable134_closed_parent_and_population_reject_before_outputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{}};path=Path(tmp)/'Own.grafetto-brushes.json';path.write_text(json.dumps(env));good=Catalog(Path(tmp)/'positive');portable_bundle(path,good);self.assertEqual(good.brushes,c.brushes)
   for case in['revision','flow','opacityCurve','timer','erase','dual','child','textureNull','material','profile','count','iterations','product','versionBool','mirror','nonNormal']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];b=d['behavior']
    if case=='revision':d['version']=133
    elif case=='flow':d['flow']=.5
    elif case=='opacityCurve':d['opacityByPressure']=[[0,0],[1,1]]
    elif case=='timer':b['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif case=='erase':b['erase']=True
    elif case=='dual':b['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);d.pop('particle');d['version']=27;b['rendering']['accumulation']='directOver';b['dual']={'brush':child,'sampling':'independent','blendMode':'subtract'}
    elif case=='textureNull':d['texture']=None
    elif case=='material':d['tip']['material']={}
    elif case=='profile':d['tip']['profile']={}
    elif case=='count':d['particle']['count']=501
    elif case=='iterations':d['particle']['iterations']=-1
    elif case=='product':d['particle'].update(count=500,iterations=200)
    elif case=='versionBool':d['particle']['version']=True
    elif case=='mirror':b['mirror']={'horizontal':True,'vertical':False,'value':1}
    else:b['rendering']['blendMode']='multiply'
    path.write_text(json.dumps(bad));out=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(path,out)
    self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
 def test_new_native_Wash_rejects_explicit_eraser_and_foreign_composite_without_published_outputs(self):
  for extra in[{'Krita/erase':'true'},{'CompositeOp':'multiply'}]:
   with tempfile.TemporaryDirectory()as tmp:
    path=Path(tmp)/'Own.kpp';path.write_bytes(authored(extra=extra));c=Catalog(Path(tmp)/'negative');convert_krita(path,c);self.assertTrue(c.skipped);self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{});self.assertEqual(list(c.output.iterdir()),[])
