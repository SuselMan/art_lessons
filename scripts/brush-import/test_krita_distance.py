import unittest
from krita_import import sensor_controls
from convert import validate_portable_dynamics
class DistanceTests(unittest.TestCase):
    def test_length_period_and_curve_are_preserved(self):
        notes=[];c=sensor_controls({'SizeSensor':'<params id="distance" length="+0010" periodic="-1"><curve>0,1;1,0;</curve></params>'},'Size',notes)[0]
        self.assertEqual((c['control'],c['period'],c['periodic']),('distance',10,True));self.assertEqual(c['curve']['samples'][0],1);validate_portable_dynamics([c])
        self.assertFalse(any(n['status']=='unsupported'for n in notes))
    def test_default_and_invalid_lengths(self):
        c=sensor_controls({'FlowSensor':'<params id="distance"/>'},'Flow',[])[0];self.assertEqual(c['period'],1000)
        for value in ['0','-1','1.5','2147483648','nan']:
            notes=[];self.assertEqual(sensor_controls({'FlowSensor':'<params id="distance" length="'+value+'"/>'},'Flow',notes),[]);self.assertTrue(any(n['status']=='unsupported'for n in notes))
