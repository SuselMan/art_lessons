import unittest,json,base64,tempfile,copy
from pathlib import Path
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from convert import portable_bundle,validate_portable_profile
from mypaint_import import mypaint_preset
from mypaint_timer177 import mypaint_timer177_header
class MyPaintTimer177(unittest.TestCase):
 def document(self,paint=True):return {'version':3,'settings':{'dabs_per_second':{'base_value':30,'inputs':{'pressure':[[0,-10],[1,10]]}},**({'paint_mode':{'base_value':.8,'inputs':{'pressure':[[0,-.2],[1,.2]]}}}if paint else{})}}
 def raw(self,flag='true',rate='20',ignore='false',erase=False,paint=True,extra=''):return kpp(engine='mypaintbrush',mode='erase'if erase else'normal',resources='<param name="MyPaint/json" type="bytearray">'+base64.b64encode(json.dumps(self.document(paint)).encode()).decode()+'</param><param name="PaintOpSettings/isAirbrushing">'+flag+'</param><param name="PaintOpSettings/rate">'+rate+'</param><param name="PaintOpSettings/ignoreSpacing">'+ignore+'</param>'+extra)
 def test_canonicalKPP_hostrate_replaces60_notinternalsettings_erase_andportable(self):
  for rate in('0','20','1000'):
   for ignore in('false','true'):
    for erase in(False,True):
     with self.subTest(rate=rate,ignore=ignore,erase=erase),tempfile.TemporaryDirectory()as t:
      c=Catalog(Path(t)/'native');x=preset(self.raw(rate=rate,ignore=ignore,erase=erase),'Own177.kpp',c,{});c.brushes.append(x);d=x['descriptor'];self.assertTrue(mypaint_timer177_header(d));self.assertEqual(d['behavior']['timing'],{'version':1,'rate':float(rate),'ignoreDistanceSpacing':ignore=='true'});self.assertEqual(d['mypaint']['erase'],erase);self.assertEqual(next(s for s in d['mypaint']['settings']if s['id']==8)['base'],30);self.assertEqual(len(d['mypaint']['settings']),2);validate_portable_profile(d);f=Path(t)/'own.grafetto-brushes.json';f.write_text(json.dumps({'library':c.write(),'assets':{}}));out=Catalog(Path(t)/'portable');portable_bundle(f,out);self.assertEqual(out.brushes,c.brushes);self.assertEqual(out.assets,{})
 def test_invalidnative_rate_andportable_scope_beforepublication(self):
  for rate in('-1','1001','NaN','Infinity','bad'):
   with self.subTest(rate=rate),tempfile.TemporaryDirectory()as t:
    c=Catalog(Path(t));
    with self.assertRaises(ValueError):preset(self.raw(rate=rate),'bad.kpp',c,{})
    self.assertEqual(c.brushes,[]);self.assertEqual(c.assets,{})
  with tempfile.TemporaryDirectory()as t:
   c=Catalog(Path(t)/'base');x=preset(self.raw(),'Own177.kpp',c,{});c.brushes.append(x);lib=c.write()
   for kind in('version','timing','spacing','policy','child'):
    d=copy.deepcopy(x['descriptor'])
    if kind=='version':d['version']=176
    elif kind=='timing':d['behavior']['timing']['rateDynamics']=[]
    elif kind=='spacing':d['behavior']['spacing']['coefficient']=.5
    elif kind=='policy':d['mypaint']['surfacePolicy']='surface2'
    with self.subTest(kind=kind),self.assertRaises(ValueError):validate_portable_profile(d,parent={}if kind=='child'else None)
 def test_old55_156wholeobjects_andinternal60_unchanged(self):
  expected=json.loads((Path(__file__).parent/'fixtures/mypaint_pre177.json').read_text())
  for paint in(False,True):
   with tempfile.TemporaryDirectory()as t:
    c=Catalog(Path(t));x=preset(self.raw(flag='false',paint=paint),'Old.kpp',c,{});self.assertEqual(x,expected[str(paint)]);self.assertEqual(x['descriptor']['version'],156 if paint else 55);self.assertEqual(x['descriptor']['behavior']['timing']['rate'],60)
 def test_standalone_MYB_notpromoted_andcanonicalonly_origin(self):
  with tempfile.TemporaryDirectory()as t:
   c=Catalog(Path(t));raw=json.dumps(self.document()).encode()
   with self.assertRaises(ValueError):mypaint_preset(raw,'notKPP.myb',c)
   with self.assertRaises(ValueError):preset(self.raw(),'child.kpp',c,{},depth=1)


 def test_outerPressureRate_nativeIgnored_butJSONpressuremapping_retained(self):
  with tempfile.TemporaryDirectory()as t:
   c=Catalog(Path(t));a=preset(self.raw(),'Own177.kpp',c,{});raw=self.raw(extra='<param name="PressureRate">true</param><param name="RateSensor"><![CDATA[<params id="pressure"><curve>0,0;1,1;</curve></params>]]></param>');z=preset(raw,'Own177.kpp',c,{});self.assertEqual(a['descriptor']['mypaint'],z['descriptor']['mypaint']);self.assertEqual(a['descriptor']['behavior']['timing'],z['descriptor']['behavior']['timing']);self.assertTrue(any(n['feature']=='nativeIgnored.mypaintPressureRate'for n in z['compatibility']));self.assertNotEqual(a['descriptor']['id'],z['descriptor']['id'])
