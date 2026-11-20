"""Authored native KPPs. Guard-only host-initial qualification, not a timer."""
import unittest,tempfile,copy,json,base64,io,os,importlib.util,hashlib
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from test_krita import kpp
from krita_import import preset,xml
from brush_contract import Catalog,finalize_identity
import convert
class FilterHostInitial186Tests(unittest.TestCase):
 def raw(self,kind='invert',bitmap=False,flags=None):
  options={'Filter/id':kind,'Filter/smudgeMode':'true','PressureSize':'false','PressureOpacity':'false','PressureFlow':'false','PressureStrength':'false','PressureRotation':'false','PaintOpSettings/isAirbrushing':'true'}
  options.update(flags or{});extra=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in options.items()if v is not None)
  definition='<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" diameter="16" ratio="1" hfade="1" vfade="1"/></Brush>'
  if bitmap:
   im=Image.new('RGBA',(2,2));im.putdata([(0,0,0,a)for a in[255,0,64,128]]);stream=io.BytesIO();im.save(stream,format='PNG');extra+='<resources><resource filename="tip.png" type="brushes">'+base64.b64encode(stream.getvalue()).decode()+'</resource></resources>';definition='<Brush type="png_brush" filename="tip.png" spacing=".1" brushApplication="0"/>'
  return kpp(definition,extra,engine='filter',mode='copy')
 def test_genuine_native_5laws_and_bitmap_portable_whole_original_seed(self):
  for kind in ['invert','desaturate','posterize','gaussian blur','unsharp']:
   for bitmap in [False,True]:
    with self.subTest(kind=kind,bitmap=bitmap),tempfile.TemporaryDirectory()as tmp:
     root=Path(tmp);c=Catalog(root/'native');raw=self.raw(kind,bitmap)
     with patch('krita_filter.finalize_identity',wraps=finalize_identity)as identity:record=preset(raw,'Own186.kpp',c,{})
     self.assertEqual(identity.call_args.args[1],raw);d=record['descriptor'];self.assertEqual(d['version'],186);self.assertNotIn('timing',d['behavior']);self.assertEqual(d['flowByPressure'],[[0,1],[1,1]]);self.assertTrue(any(n['feature']=='filterHostInitial186'and 'NO_SMOOTHING'in n['detail']for n in record['compatibility']));c.brushes.append(record)
     envelope={'library':c.write(),'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}};f=root/'own.grafetto-brushes.json';f.write_text(json.dumps(envelope));dest=Catalog(root/'portable');convert.portable_bundle(f,dest);self.assertEqual(dest.brushes,c.brushes);self.assertEqual(dest.assets,c.assets)
 def test_prebridge_active_controls_and_alias_conflict_reject_without_timing_erasure(self):
  changes=[{'Pressure'+key:'true'}for key in ['Size','Opacity','Flow','Strength','Rotation','Rate']]+[{'PressureFlow':None,'FlowUseCurve':'true'},{'PressureOpacity':None,'OpacityUseCurve':'true'},{'AirbrushOption/isAirbrushing':'false'},{'Filter/smudgeMode':'false'},{'PaintOpSettings/ignoreSpacing':'true'},{'RotationSensor':'<params id="drawingangle" fanCornersEnabled="1"/>'}]
  for flags in changes:
   with self.subTest(flags=flags),tempfile.TemporaryDirectory()as tmp:
    with self.assertRaisesRegex(ValueError,'186'):preset(self.raw(flags=flags),'Own186.kpp',Catalog(Path(tmp)),{})
 def test_alias_literals_not_normalized_for_identity_and_old_whole_records(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);a=self.raw();b=self.raw(flags={'PaintOpSettings/isAirbrushing':None,'AirbrushOption/isAirbrushing':'true'});first=preset(a,'Own186.kpp',Catalog(root/'a'),{});second=preset(b,'Own186.kpp',Catalog(root/'b'),{});self.assertEqual(first['descriptor']['version'],186);self.assertEqual(second['descriptor']['version'],186);self.assertNotEqual(first['descriptor']['id'],second['descriptor']['id']);self.assertNotEqual(hashlib.sha256(a).digest(),hashlib.sha256(b).digest())
   source=os.environ['FILTER186_BASE_FILE'];spec=importlib.util.spec_from_file_location('filter186_old',source);old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
   for kind,bitmap in [('invert',False),('gaussian blur',False),('unsharp',False),('invert',True),('desaturate',True)]:
    raw=self.raw(kind,bitmap,{'PaintOpSettings/isAirbrushing':'false'});im=Image.open(io.BytesIO(raw));im.load();r=xml(im.info['preset']);params={n.get('name'):n.text or''for n in r.findall('param')};before=old.filter_preset(raw,r,params,'Old.kpp',Catalog(root/('old'+kind+str(bitmap))),{});after=preset(raw,'Old.kpp',Catalog(root/('new'+kind+str(bitmap))),{});self.assertEqual(after,before)
 def test_portable_contradictions_fail_valueerror_before_catalog_publication(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);c=Catalog(root/'native');c.brushes.append(preset(self.raw(),'Own186.kpp',c,{}));env={'library':c.write(),'assets':{}}
   for change in ['curve','timing','flow','mask','behavior','dual']:
    bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor']
    if change=='curve':d['sizeByPressure']=[[0,0],[1,1]]
    elif change=='timing':d['behavior']['timing']={}
    elif change=='flow':d['flowByPressure']=[[0,0],[1,1]]
    elif change=='mask':d['filter']['maskPolicy']='bitmap-alpha-v1'
    elif change=='behavior':d['behavior']=None
    else:d['behavior']['dual']={}
    f=root/(change+'.grafetto-brushes.json');f.write_text(json.dumps(bad));dest=Catalog(root/change)
    with self.subTest(change=change),self.assertRaises(ValueError):convert.portable_bundle(f,dest)
    self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
