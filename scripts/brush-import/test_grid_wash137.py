"""Authored native-format Grid controls; genuine original imported only in future CAPS."""
from pathlib import Path
import io,json,copy,tempfile,unittest
import xml.etree.ElementTree as ET
from PIL import Image,PngImagePlugin
from brush_contract import Catalog,finalize_identity
from krita_import import convert_krita
from convert import portable_bundle
from grid_wash137 import grid_wash137_scope
FIXTURE=json.loads((Path(__file__).parent/'fixtures/grid_wash137_controls.json').read_text())
def authored(action='2',extra=None):
 tree=ET.Element('Preset',{'name':'Own Grid137 derivative','paintopid':'gridbrush'})
 for k,v in{**FIXTURE['params'],'PaintOpAction':action,**(extra or{})}.items():ET.SubElement(tree,'param',{'name':k}).text=v
 info=PngImagePlugin.PngInfo();info.add_text('preset',ET.tostring(tree,encoding='unicode'));buf=io.BytesIO();Image.new('RGB',(2,2),'red').save(buf,format='PNG',pnginfo=info);return buf.getvalue()
class GridWash137(unittest.TestCase):
 def native(self,tmp,action='2',extra=None):
  raw=authored(action,extra);file=Path(tmp)/'Own.kpp';file.write_bytes(raw);c=Catalog(Path(tmp)/'native');convert_krita(file,c);self.assertFalse(c.skipped);self.assertEqual(len(c.brushes),1);return c,raw
 def test_action2_newcanonical_policy_unitresponse_vs_archived48_action1(self):
  rows=[]
  for action,version in [('2',137),('1',48)]:
   with tempfile.TemporaryDirectory()as tmp:
    c,raw=self.native(tmp,action);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(d['id'],finalize_identity(copy.deepcopy(d),raw)['id']);self.assertEqual(grid_wash137_scope(d),action=='2');self.assertEqual(d['mixer']['source'],'previousCanvas');self.assertEqual(d['flow'],1);self.assertEqual(d['opacity'],1)
    for key in ('sizeByPressure','flowByPressure','opacityByPressure'):self.assertEqual(d[key],[[0,1],[1,1]])
    if action=='2':
     self.assertEqual(d['grid']['sourcePolicy'],'canonical-begin-v1');self.assertEqual(d['behavior']['rendering']['accumulation'],'alphaDarken');note=next(n for n in c.brushes[0]['compatibility']if n['feature']=='gridWash');self.assertEqual(note['status'],'approximate');self.assertIn('Canonical-BEGIN',note['detail']);self.assertIn('point sampling',note['detail'])
    else:self.assertNotIn('sourcePolicy',d['grid']);self.assertEqual(d['behavior']['rendering']['accumulation'],'directOver')
    rows.append(d)
  for k in ('tip','mixer','spacing','flow','opacity','sizeByPressure','flowByPressure','opacityByPressure'):self.assertEqual(rows[0][k],rows[1][k])
  self.assertNotEqual(rows[0]['id'],rows[1]['id'])
 def test_native_grid_has_no_flow_or_opacity_controls_and_fixed_borders_are_general(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp,extra={'FlowSensor':'not used XML','FlowUseCurve':'true','OpacitySensor':'not used XML','OpacityUseCurve':'true','Grid/gridWidth':'37','Grid/gridHeight':'12','Grid/verticalBorder':'2','Grid/horizontalBorder':'3'});d=c.brushes[0]['descriptor'];self.assertTrue(grid_wash137_scope(d));self.assertEqual(d['grid']['border'],[2,3]);self.assertEqual(d['flowByPressure'],[[0,1],[1,1]]);self.assertEqual(d['opacityByPressure'],[[0,1],[1,1]])
 def test_action2_outside_scope_is_rejected_before_outputs_not_fallback(self):
  for extra in [{'GridShape/shape':'0'},{'ColorOption/sampleInputColor':'false'},{'ColorOption/colorPerParticle':'true'},{'ColorOption/useRandomHSV':'true'},{'ColorOption/fillBackground':'true'},{'ColorOption/mixBgColor':'true'},{'Grid/randomBorder':'true'},{'ColorOption/useRandomOpacity':'true'},{'Grid/pressureDivision':'true'},{'PaintOpSettings/isAirbrushing':'true'},{'AirbrushOption/isAirbrushing':'true'},{'EraserMode':'true'},{'Krita/erase':'true'}]:
   with self.subTest(extra=extra),tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp)/'Own.kpp';p.write_bytes(authored(extra=extra));c=Catalog(Path(tmp)/'bad');convert_krita(p,c);self.assertTrue(c.skipped);self.assertFalse(c.brushes);self.assertFalse(c.assets);self.assertEqual(list(c.output.iterdir()),[])
 def test_portable_closed_scope_parent_policy_and_unit_curves_beforeoutputs(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{}};file=Path(tmp)/'Own.grafetto-brushes.json';file.write_text(json.dumps(env));good=Catalog(Path(tmp)/'good');portable_bundle(file,good);self.assertEqual(good.brushes,c.brushes)
   for case in ('revision','missingPolicy','badPolicy','nullGrid','shape','sample','color','HSV','fill','mix','randomBorder','randomOpacity','pressureDivision','timer','erase','dual','child','material','foreign','source','algorithm','opacity','flow','flowCurve','opacityCurve','sizeCurve','dynamics','width','division','border'):
    e=copy.deepcopy(env);d=e['library']['brushes'][0]['descriptor'];g=d['grid'];b=d['behavior']
    if case=='revision':d['version']=136
    elif case=='missingPolicy':g.pop('sourcePolicy')
    elif case=='badPolicy':g['sourcePolicy']=['canonical-begin-v1']
    elif case=='nullGrid':d['grid']=None
    elif case=='shape':g['shape']=0
    elif case=='sample':g['sampleInput']=False
    elif case=='color':g['colorPerCell']=True
    elif case=='HSV':g['hsv']={'hue':.1,'saturation':0,'value':0}
    elif case=='fill':g['fillBackground']=True
    elif case=='mix':g['mixBackground']=True
    elif case in ('randomBorder','randomOpacity','pressureDivision'):g[case]=True
    elif case=='timer':b['timing']={'version':1,'rate':20,'ignoreDistanceSpacing':False}
    elif case=='erase':b['erase']=True
    elif case=='dual':b['dual']={}
    elif case=='child':
     child=copy.deepcopy(d);d.pop('grid');d.pop('mixer');d['model']='stamp';d['version']=27;b['rendering']['accumulation']='directOver';b['dual']={'brush':child,'sampling':'independent','blendMode':'subtract'}
    elif case=='material':d['tip']['material']={}
    elif case=='foreign':d['particle']={}
    elif case=='source':d['mixer']['source']='projectionCanvas'
    elif case=='algorithm':d['mixer']['algorithm']='krita-mask'
    elif case in ('opacity','flow'):d[case]=.5
    elif case in ('flowCurve','opacityCurve','sizeCurve'):d[{'flowCurve':'flowByPressure','opacityCurve':'opacityByPressure','sizeCurve':'sizeByPressure'}[case]]=[[0,0],[1,1]]
    elif case=='dynamics':b['dynamics']={'opacity':{}}
    elif case=='width':g['width']=1025
    elif case=='division':g['division']=17
    else:g['border']=[-1,0]
    file.write_text(json.dumps(e));bad=Catalog(Path(tmp)/case)
    with self.subTest(case=case),self.assertRaises(ValueError):portable_bundle(file,bad)
    self.assertFalse(bad.brushes);self.assertFalse(bad.assets);self.assertEqual(list(bad.output.iterdir()),[])

 def test_portable_integral_json_floats_match_shared_numbers_but_bool_and_fraction_reject(self):
  with tempfile.TemporaryDirectory()as tmp:
   c,_=self.native(tmp);env={'library':c.write(),'assets':{}};d=env['library']['brushes'][0]['descriptor'];d['version']=137.0;d['grid']['version']=1.0;d['grid']['division']=0.0;d['grid']['shape']=1.0;d['behavior']['version']=2.0
   self.assertTrue(grid_wash137_scope(d));file=Path(tmp)/'Float.grafetto-brushes.json';file.write_text(json.dumps(env))
   # Existing common portable envelope requires an int top-level version for
   # every family. Keep that archived boundary; new Grid helper itself matches JS.
   badtop=Catalog(Path(tmp)/'existing-top-float-restriction')
   with self.assertRaises(ValueError):portable_bundle(file,badtop)
   self.assertFalse(badtop.brushes);self.assertFalse(badtop.assets);self.assertEqual(list(badtop.output.iterdir()),[])
   d['version']=137;file.write_text(json.dumps(env));good=Catalog(Path(tmp)/'float-positive');portable_bundle(file,good);self.assertEqual(good.brushes,c.brushes)
   for index,(section,key)in enumerate([(None,'version'),('grid','version'),('grid','division'),('grid','shape'),('behavior','version')]):
    for badvalue in (True,1.5):
     badenv=copy.deepcopy(env);b=badenv['library']['brushes'][0]['descriptor'];target=b if section is None else b[section];target[key]=badvalue;self.assertFalse(grid_wash137_scope(b));file.write_text(json.dumps(badenv));bad=Catalog(Path(tmp)/('bad-number-'+str(index)+'-'+str(badvalue)))
     with self.assertRaises(ValueError):portable_bundle(file,bad)
     self.assertFalse(bad.brushes);self.assertFalse(bad.assets);self.assertEqual(list(bad.output.iterdir()),[])
