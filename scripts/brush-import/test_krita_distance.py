import unittest
from krita_import import sensor_controls
from convert import validate_portable_dynamics
class DistanceTests(unittest.TestCase):
    def test_length_period_and_curve_are_preserved(self):
        notes=[];c=sensor_controls({'SizeSensor':'<params id="distance" length="+0010" periodic="-1"><curve>0,1;1,0;</curve></params>'},'Size',notes)[0]
        self.assertEqual((c['control'],c['period'],c['periodic']),('distance',10,True));self.assertEqual(c['curve']['samples'][0],1);validate_portable_dynamics([c])
        self.assertFalse(any(n['status']=='unsupported'for n in notes))
    def test_default_and_invalid_lengths(self):
        # native KisSensorWithLengthData defaults: Distance=30, Fade=1000, Time=30
        c=sensor_controls({'FlowSensor':'<params id="distance"/>'},'Flow',[])[0];self.assertEqual(c['period'],30)
        for value in ['0','-1','1.5','2147483648','nan']:
            notes=[];self.assertEqual(sensor_controls({'FlowSensor':'<params id="distance" length="'+value+'"/>'},'Flow',notes),[]);self.assertTrue(any(n['status']=='unsupported'for n in notes))
    def test_missing_distance_length_equals_explicit_thirty(self):
        notes=[];missing=sensor_controls({'FlowSensor':'<params id="distance"/>'},'Flow',notes)[0]
        explicit=sensor_controls({'FlowSensor':'<params id="distance" length="30"/>'},'Flow',[])[0]
        self.assertEqual(missing['control'],'distance');self.assertEqual(missing['period'],30)
        self.assertEqual(explicit['period'],missing['period']);self.assertEqual(explicit['periodic'],missing['periodic'])
        validate_portable_dynamics([missing]);self.assertFalse(any(n['status']=='unsupported'for n in notes))
    def test_fade_and_time_defaults_are_unchanged(self):
        fade=sensor_controls({'FlowSensor':'<params id="fade"/>'},'Flow',[])[0]
        self.assertEqual((fade['control'],fade['period'],fade['periodic']),('dabProgress',1000,False));validate_portable_dynamics([fade])
        timed=sensor_controls({'FlowSensor':'<params id="time"/>'},'Flow',[],allow_time=True)[0]
        self.assertEqual((timed['control'],timed['period'],timed['periodic']),('time',30,False));validate_portable_dynamics([timed])
        notes=[];self.assertEqual(sensor_controls({'FlowSensor':'<params id="time"/>'},'Flow',notes),[]);self.assertTrue(any(n['status']=='unsupported'for n in notes))
