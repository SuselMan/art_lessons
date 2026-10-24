"""Independent authored additive rotation witnesses, no named preset hacks."""
from pathlib import Path
import tempfile
import math
import unittest
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp


class RotationImportTests(unittest.TestCase):
    def brush(self,tmp,strength='1',sensor='<params id="ascension"><curve>0,0;1,1;</curve></params>',extra=None):
        params={'PressureRotation':'true','RotationUseCurve':'true','RotationSensor':sensor,'RotationValue':strength,**(extra or {})}
        text=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>' for k,v in params.items())
        path=Path(tmp)/'Unrelated.kpp';path.write_bytes(kpp(resources=text))
        c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c);self.assertEqual(c.skipped,[]);return c.brushes[0]

    def test_positive_negative_and_zero_strength_endpoints_cardinals(self):
        for strength in [1,-1,0,.5]:
            with self.subTest(strength=strength),tempfile.TemporaryDirectory() as tmp:
                b=self.brush(tmp,str(strength));d=b['descriptor']['behavior']['dynamics']['angle']
                self.assertEqual((d['control'],d['minimum'],d['jitter']),('tiltDirection',0,0))
                self.assertEqual(d['curve'],[[0,.5-.5*strength],[1,.5+.5*strength]])
                for u in [0,.25,.5,.75,1]:
                    response=.5+strength*(u-.5)
                    # Physical native raster negates the internal option angle.
                    self.assertAlmostEqual(-(1-strength*(2*u-1))/2,response-1)
                self.assertFalse(any(x['feature']=='activeDynamics' and 'PressureRotation' in x['detail'] for x in b['compatibility']))

    def test_native_cubic_precedes_strength_and_common_curve_selection(self):
        with tempfile.TemporaryDirectory() as tmp:
            sensor='<params id="ascension"><curve>0,0;0.5,0.2;1,1;</curve></params>'
            b=self.brush(tmp,'.5',sensor)
            curve=b['descriptor']['behavior']['dynamics']['angle']['curve']
            self.assertEqual(len(curve['samples']),256);self.assertEqual(curve['samples'][0],.25);self.assertEqual(curve['samples'][-1],.75)
            self.assertLess(curve['samples'][128],.36)
            self.assertNotIn('preserveInputSign',curve)
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp,'1',extra={'RotationcommonCurve':'0,1;1,0;','RotationUseSameCurve':'true'})
            values=b['descriptor']['behavior']['dynamics']['angle']['curve']['samples']
            self.assertEqual(values[0],1);self.assertEqual(values[-1],0)
            self.assertAlmostEqual(values[128],1-128/255)

    def test_static_auto_and_bitmap_angles_convert_to_physical_clockwise(self):
        for kind in ['auto','bitmap']:
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as tmp:
                angle=math.pi/3
                definition=('<Brush type="auto_brush" angle="'+str(angle)+'"><MaskGenerator type="circle" ratio=".5"/></Brush>' if kind=='auto' else '<Brush type="png_brush" angle="'+str(angle)+'" filename="L.png" ColorAsMask="1"/>')
                path=Path(tmp)/'Unrelated.kpp';path.write_bytes(kpp(definition=definition))
                c=convert.Catalog(Path(tmp)/'out')
                import io
                pixel=io.BytesIO();Image.new('L',(2,2)).save(pixel,format='PNG')
                convert_krita(path,c,{'L.png':pixel.getvalue()})
                self.assertEqual(c.skipped,[])
                self.assertAlmostEqual(c.brushes[0]['descriptor']['tip']['angle'],-angle)

    def test_unequal_raw_tilt_asymmetric_L_physical_rotation(self):
        # Source L basis legs right/down. Native internal257.471deg plusbase90
        # is negated byQt; expected physical rightleg falls DOWN, notup.
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp);curve=b['descriptor']['behavior']['dynamics']['angle']['curve']
            direction=math.atan2(-45,10);u=direction/(2*math.pi)+.5
            response=curve[0][1]+u*(curve[1][1]-curve[0][1])
            physical=-math.pi/2+(response-1)*2*math.pi
            self.assertAlmostEqual(math.cos(physical),.9761870601839527)
            self.assertAlmostEqual(math.sin(physical),.2169304578186564)
            for x,y in [(45,10),(10,45),(-45,10),(45,-10),(-45,-10),(0,0)]:
                theta=math.atan2(-x,y) if x or y else -math.pi/2
                u=theta/(2*math.pi)+.5;response=u
                actual=-math.pi/2+(response-1)*2*math.pi
                native=-(math.pi/2+(1-(2*u-1))*math.pi)
                self.assertAlmostEqual(math.cos(actual),math.cos(native));self.assertAlmostEqual(math.sin(actual),math.sin(native))

    def test_fuzzy_rotation_keeps_curve_strength_and_native_half_turn(self):
        for strength in [-1,0,.5,1]:
            with self.subTest(strength=strength),tempfile.TemporaryDirectory() as tmp:
                b=self.brush(tmp,str(strength),'<params id="fuzzy"><curve>0,0;.5,.2;1,1;</curve></params>')
                d=b['descriptor'];control=d['behavior']['dynamics']['angle'];curve=control['curve']
                self.assertEqual(control['control'],'random');self.assertEqual(control['jitter'],0)
                self.assertEqual(d['tip']['angle'],0)
                self.assertAlmostEqual(curve['samples'][0],.5-.5*strength)
                self.assertAlmostEqual(curve['samples'][-1],.5+.5*strength)
                for i in [0,64,128,192,255]:
                    from curve_transfer import native_transfer
                    response=native_transfer('0,0;.5,.2;1,1;')['samples'][i]
                    actual=d['tip']['angle']+(curve['samples'][i]-1)*2*math.pi
                    native=-math.pi+strength*math.pi*(2*response-1)
                    self.assertAlmostEqual(math.cos(actual),math.cos(native))
                    self.assertAlmostEqual(math.sin(actual),math.sin(native))

    def test_absolute_drawing_direction_offset_is_not_random_rotation(self):
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp,'1','<params id="drawingangle" angleOffset="91" lockedAngleMode="false"><curve>0,0;1,1;</curve></params>')
            d=b['descriptor'];self.assertEqual(d['behavior']['rotation'],{'follow':1,'random':'none'})
            self.assertAlmostEqual(d['tip']['angle'],math.radians(91))
            for direction in [0,math.pi/2,-math.pi/2]:
                self.assertAlmostEqual(math.cos(d['tip']['angle']+direction),math.cos(direction+math.radians(91)))
            self.assertTrue(any(x['feature']=='RotationDrawingAngle' for x in b['compatibility']))

    def test_combined_additive_and_scaling_and_keyed_stroke_random(self):
        with tempfile.TemporaryDirectory() as tmp:
            sensor='<params id="sensorslist"><ChildSensor id="fuzzy"><curve>0,0;1,1;</curve></ChildSensor><ChildSensor id="pressure"><curve>0,0;.5,.2;1,1;</curve></ChildSensor></params>'
            b=self.brush(tmp,'.31',sensor,{'RotationUseSameCurve':'false'})
            c=b['descriptor']['behavior']['rotation']['composition']
            self.assertEqual(c['strength'],.31);self.assertEqual(c['additive'][0]['control'],'random');self.assertEqual(c['scaling'][0]['control'],'pressure')
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp,'1','<params id="fuzzystroke"/>')
            c=b['descriptor']['behavior']['rotation']['composition'];self.assertEqual(c['additive'][0]['control'],'strokeRandom');self.assertIsInstance(c['additive'][0]['randomStream'],int)

    def test_other_sensors_combinations_disabled_curve_and_outside_strength_stay_unsupported(self):
        cases=[
               ('1','<params id="sensorslist"><ChildSensor id="ascension"/><ChildSensor id="pressure"/></params>',{}),
               ('1','<params id="ascension"/>',{'RotationcurveMode':'1'}),
               ('1','<params id="ascension"/>',{'RotationUseCurve':'false'}),
               ('2','<params id="ascension"/>',{})]
        for strength,sensor,extra in cases:
            with self.subTest(sensor=sensor,extra=extra),tempfile.TemporaryDirectory() as tmp:
                b=self.brush(tmp,strength,sensor,extra)
                self.assertNotIn('angle',b['descriptor']['behavior'].get('dynamics',{}))
                self.assertTrue(any(x['status']=='unsupported' and 'PressureRotation' in x['detail'] for x in b['compatibility']))
        with tempfile.TemporaryDirectory() as tmp:
            b=self.brush(tmp,extra={'PressureRotation':'false'})
            self.assertNotIn('angle',b['descriptor']['behavior'].get('dynamics',{}))
            self.assertFalse(any('PressureRotation' in x['detail'] for x in b['compatibility']))


if __name__=='__main__':unittest.main()
