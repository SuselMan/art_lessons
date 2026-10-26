"""Authored bitmap geometry; no vendor image redistribution."""
import copy
import io
import json
import math
from pathlib import Path
import tempfile
import unittest
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
import test_krita_spacing


class BitmapSpacingMetricsTests(unittest.TestCase):
    def brush(self, width=7, height=32, angle=0, auto=False):
        image=io.BytesIO();Image.new('RGB',(width,height),'black').save(image,format='PNG')
        definition=f'<Brush type="png_brush" filename="authored.png" spacing=".14" angle="{angle}" useAutoSpacing="{int(auto)}" autoSpacingCoeff=".8"/>'
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'Authored.kpp';path.write_bytes(kpp(definition,resources='<param name="PressureSize">false</param>'))
            c=convert.Catalog(Path(tmp)/'out');convert_krita(path,c,{'authored.png':image.getvalue()})
            self.assertEqual(c.skipped,[])
            b=c.brushes[0];a=c.assets[b['descriptor']['tip']['mask']]
            return b, (c.output/a['file']).read_bytes()

    def test_original_portrait_dimensions_do_not_compress_the_mask_twice(self):
        b,pixels=self.brush();d=b['descriptor'];p=d['behavior']['spacing']
        self.assertEqual(p,{'mode':'diameter','coefficient':.14,'axisScale':{'x':7/32,'y':1}})
        self.assertEqual(d['tip']['aspect'],1)
        self.assertEqual(d['tip']['maskBounds'],{'x':15.5/64,'y':16/64,'width':.5,'height':.5})
        self.assertEqual(sum(pixels),7*32*255)
        self.assertAlmostEqual(48*.14*p['axisScale']['x'],1.47)

    def test_static_angle_is_baked_into_axes_and_removed_from_dynamic_orientation(self):
        b,_=self.brush(angle=math.pi/2);d=b['descriptor'];p=d['behavior']['spacing']
        self.assertAlmostEqual(p['axisScale']['x'],1)
        self.assertAlmostEqual(p['axisScale']['y'],7/32)
        self.assertAlmostEqual(p['angleOffset'],-d['tip']['angle'])
        self.assertAlmostEqual(p['angleOffset'],math.pi/2)
        b,_=self.brush(width=32,height=32,angle=math.pi/4,auto=True)
        p=b['descriptor']['behavior']['spacing']
        self.assertEqual(p['mode'],'kritaAuto')
        self.assertAlmostEqual(p['axisScale']['x'],math.sqrt(2))
        self.assertAlmostEqual(p['axisScale']['y'],math.sqrt(2))

    def test_identity_square_does_not_add_metadata(self):
        b,_=self.brush(width=32,height=32)
        self.assertEqual(b['descriptor']['behavior']['spacing'],{'mode':'diameter','coefficient':.14})

    def test_portable_profiles_roundtrip_and_reject_malformed_metrics_atomically(self):
        b=test_krita_spacing.PressureSpacingTests().brush()
        bundle={'library':{'schemaVersion':1,'brushes':[b],'assets':[],'skipped':[]},'assets':{}}
        profile=b['descriptor']['behavior']['spacing'];profile.update(axisScale={'x':7/32,'y':1},angleOffset=math.pi)
        bad_fields=[{'axisScale':{'x':0,'y':1}},{'axisScale':{'x':True,'y':1}},{'axisScale':{'x':2.01,'y':1}},{'axisScale':{'x':1}},{'axisScale':{'x':1,'y':1,'extra':1}},{'axisScale':{'x':float('nan'),'y':1}},{'angleOffset':True},{'angleOffset':math.pi+.001},{'angleOffset':float('inf')}]
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'profile.grafetto-brushes.json';path.write_text(json.dumps(bundle))
            c=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(path,c)
            self.assertEqual(c.brushes[0]['descriptor']['behavior']['spacing'],profile)
            for i,fields in enumerate(bad_fields):
                bad=copy.deepcopy(bundle);bad['library']['brushes'][0]['descriptor']['behavior']['spacing'].update(fields);path.write_text(json.dumps(bad))
                c=convert.Catalog(Path(tmp)/str(i))
                with self.assertRaises(ValueError):convert.portable_bundle(path,c)
                self.assertEqual(list(c.output.iterdir()),[])


if __name__=='__main__':unittest.main()
