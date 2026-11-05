"""Timed source inputs are explicit; unsupported Rate controls cannot activate."""
from pathlib import Path
import tempfile,unittest
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita
class TimingTests(unittest.TestCase):
 def brush(self,params,flag=False):
  with tempfile.TemporaryDirectory()as tmp:
   path=Path(tmp)/'Generic.kpp';meta=PngImagePlugin.PngInfo();meta.add_text('version','5.0')
   definition='<Brush type="auto_brush"><MaskGenerator type="circle"/></Brush>'
   text=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in {'brush_definition':definition,**params}.items())
   meta.add_text('preset','<Preset name="Generic" paintopid="paintbrush">'+text+'</Preset>');Image.new('RGB',(2,2)).save(path,format="PNG",pnginfo=meta)
   c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,timed_input=flag)
   self.assertEqual(c.skipped,[]);return c.brushes[0]
 def test_default_off_and_canonical_only(self):
  p={'PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':'20'}
  self.assertNotIn('timing',self.brush(p)['descriptor']['behavior'])
  self.assertEqual(self.brush(p,True)['descriptor']['behavior']['timing'],{'version':1,'rate':20,'ignoreDistanceSpacing':False})
  self.assertNotIn('timing',self.brush({'AirbrushOption/isAirbrushing':'true','AirbrushOption/rate':'1000'},True)['descriptor']['behavior'])
 def test_zero_rate_and_disabled_stale_random(self):
  p={'PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':'0','PressureRate':'false','RateSensor':'<params id="fuzzy"/>'}
  self.assertEqual(self.brush(p,True)['descriptor']['behavior']['timing']['rate'],0)
 def test_unknown_and_random_rate_fail_closed(self):
  for sensor in ('fuzzy','unknown','time'):
   b=self.brush({'PaintOpSettings/isAirbrushing':'true','PressureRate':'true','RateSensor':'<params id="'+sensor+'"/>'},True)
   self.assertNotIn('timing',b['descriptor']['behavior'])
   self.assertTrue(any(n['feature']=='airbrush'and n['status']=='unsupported'for n in b['compatibility']))
 def test_pressure_rate_constant_and_nontrivial_curve(self):
  b=self.brush({'PaintOpSettings/isAirbrushing':'true','PressureRate':'true','RateValue':'.5','RatecommonCurve':'0,0;0.8,0.9;1,0.115578;','RateSensor':'<params id="pressure"/>'},True)
  controls=b['descriptor']['behavior']['timing']['rateDynamics'];self.assertEqual(len(controls),2)
  self.assertEqual(controls[1]['control'],'off');self.assertEqual(controls[1]['curve'],[[0,.5],[1,.5]])
  self.assertAlmostEqual(controls[0]['curve']['samples'][-1],.115578)
 def test_time_sensor_optin_duration_and_period(self):
  p={'PressureSize':'true','SizeSensor':'<params id="time" duration="720" periodic="1"/>'}
  self.assertNotIn('modulations',self.brush(p)['descriptor']['behavior'])
  d=self.brush(p,True)['descriptor'];c=d['behavior']['modulations']['size'][0]
  self.assertEqual((c['control'],c['period'],c['periodic']),('time',720,True));self.assertEqual(d['version'],35)
  convert.validate_portable_dynamics([c])
  for duration in (0,2147483648):
   with self.assertRaises(ValueError):convert.validate_portable_dynamics([{**c,'period':duration}])

 def test_invalid_rates_retain_unsupported_status_without_clamping(self):
  for rate in ('not-a-number','nan','inf','-1','1000.01'):
   b=self.brush({'PaintOpSettings/isAirbrushing':'true','PaintOpSettings/rate':rate},True)
   self.assertNotIn('timing',b['descriptor']['behavior'])
   self.assertTrue(any(n['feature']=='airbrush'and n['status']=='unsupported'for n in b['compatibility']))
 def test_time_uses_native_integer_duration_and_periodic_flag(self):
  b=self.brush({'PressureSize':'true','SizeSensor':'<params id="time" duration="+0030" periodic="2"/>'},True)
  c=b['descriptor']['behavior']['modulations']['size'][0]
  self.assertEqual((c['period'],c['periodic']),(30,True))

 def test_nonpainting_random_refresh_requires_a_source_event_contract(self):
  for option in ('Size','Rotation','Spacing'):
   p={'PaintOpSettings/isAirbrushing':'true','Pressure'+option:'true',option+'Sensor':'<params id="fuzzy"/>'}
   b=self.brush(p,True)
   self.assertNotIn('timing',b['descriptor']['behavior'])
   self.assertTrue(any(n['feature']=='airbrush'and 'non-painting RNG event'in n['detail']and n['status']=='unsupported'for n in b['compatibility']))
   p[option+'UseCurve']='false'
   self.assertIn('timing',self.brush(p,True)['descriptor']['behavior'])

 def test_mirror_refresh_checks_both_axes_before_random_sensor(self):
  # Actual stock110 source shape: checked fuzzy mirror with BOTH axes enabled.
  # Both axes toggling together cancels implicitFlipped, but the random draw
  # still occurs before effectiveSpacing. Do not simplify that draw away.
  base={'PaintOpSettings/isAirbrushing':'true','PressureMirror':'true','MirrorUseCurve':'true','MirrorSensor':'<params id="fuzzy"/>'}
  for horizontal,vertical in (('true','true'),('true','false'),('false','true')):
   p={**base,'HorizontalMirrorEnabled':horizontal,'VerticalMirrorEnabled':vertical}
   b=self.brush(p,True)
   self.assertNotIn('timing',b['descriptor']['behavior'])
   self.assertTrue(any(n['feature']=='airbrush'and n['status']=='unsupported'and 'Mirror spacing-refresh' in n['detail']for n in b['compatibility']))
  for overrides in ({},{'HorizontalMirrorEnabled':'false','VerticalMirrorEnabled':'false'},
                    {'HorizontalMirrorEnabled':'true','PressureMirror':'false'},
                    {'VerticalMirrorEnabled':'true','MirrorUseCurve':'false'}):
   self.assertIn('timing',self.brush({**base,**overrides},True)['descriptor']['behavior'])

 def test_mirror_guard_preserves_independent_time_sensor(self):
  b=self.brush({'PaintOpSettings/isAirbrushing':'true','PressureMirror':'true','HorizontalMirrorEnabled':'true',
    'MirrorSensor':'<params id="fuzzy"/>','PressureSize':'true','SizeSensor':'<params id="time" duration="720" periodic="1"/>'},True)
  self.assertNotIn('timing',b['descriptor']['behavior'])
  self.assertEqual(b['descriptor']['behavior']['modulations']['size'][0]['control'],'time')
