"""Independent Size-option witnesses; no vendor pixels or name gates."""
import io
from pathlib import Path
import tempfile
import unittest
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita

def authored(params):
    params=dict(params)
    definition=params.pop('brush_definition','<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio="1" diameter="100"/></Brush>')
    text='<Preset name="Authored" paintopid="paintbrush"><param name="brush_definition"><![CDATA['+definition+']]></param>'
    text+=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in params.items())+'</Preset>'
    meta=PngImagePlugin.PngInfo();meta.add_text('preset',text);out=io.BytesIO();Image.new('L',(2,2)).save(out,format='PNG',pnginfo=meta);return out.getvalue()

class SizeStrengthTests(unittest.TestCase):
    def brush(self,params,skipped=False):
        with tempfile.TemporaryDirectory()as tmp:
            p=Path(tmp)/'Authored.kpp';p.write_bytes(authored(params));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
            if skipped:self.assertTrue(c.skipped);return c.skipped
            self.assertEqual(c.skipped,[]);return c.brushes[0]['descriptor']
    def test_checked_constant_survives_disabled_curve(self):
        d=self.brush({'PressureSize':'true','SizeValue':'.52','SizeUseCurve':'false'})
        self.assertEqual(d['sizeByPressure'],[[0,.52],[1,.52]])
        self.assertNotIn('size',d['behavior'].get('modulations',{}))
    def test_unchecked_and_missing_ignore_stale_malformed_strength_and_curve(self):
        for checked in [None,'false']:
            p={'SizeValue':'bad stale','SizeUseCurve':'true','SizeSensor':'<params id="pressure"/>'}
            if checked is not None:p['PressureSize']=checked
            d=self.brush(p);self.assertEqual(d['sizeByPressure'],[[0,1],[1,1]])
            self.assertNotIn('size',d['behavior'].get('modulations',{}))
    def test_checked_missing_strength_and_usecurve_defaults(self):
        self.assertEqual(self.brush({'PressureSize':'true'})['sizeByPressure'],[[0,0],[1,1]])
        self.assertEqual(self.brush({'PressureSize':'true','SizeUseCurve':'false'})['sizeByPressure'],[[0,1],[1,1]])
    def test_pressure_strength_after_native_response(self):
        d=self.brush({'PressureSize':'true','SizeValue':'.47','SizeSensor':'<params id="pressure"><curve>0,.2;1,1;</curve></params>','SizeUseSameCurve':'false'})
        t=d['sizeByPressure']['samples'];self.assertAlmostEqual(t[0],.094);self.assertAlmostEqual(t[-1],.47);self.assertAlmostEqual(t[128],.47*(.2+.8*128/255))
    def test_zero_and_invalid_checked_strength(self):
        self.assertEqual(self.brush({'PressureSize':'true','SizeValue':'0','SizeUseCurve':'false'})['sizeByPressure'],[[0,0],[1,0]])
        for value in ['nan','inf','-.1','1.1','bad']:self.brush({'PressureSize':'true','SizeValue':value},skipped=True)
    def test_master_ratio_after_child_constant_exactly_once(self):
        child='<Brush type="auto_brush"><MaskGenerator type="circle" diameter="30" ratio="1"/></Brush>'
        d=self.brush({'MaskingBrush/Enabled':'true','MaskingBrush/UseMasterSize':'true','MaskingBrush/MasterSizeCoeff':'.3','MaskingBrush/Preset/brush_definition':child,'MaskingBrush/Preset/PressureSize':'true','MaskingBrush/Preset/SizeValue':'.52','MaskingBrush/Preset/SizeUseCurve':'false'})
        c=d['behavior']['dual']['brush'];self.assertAlmostEqual(c['sizeByPressure'][0][1],.156);self.assertAlmostEqual(48*c['sizeByPressure'][1][1],7.488)
        self.assertEqual(d['sizeByPressure'],[[0,1],[1,1]])
    def test_multiinput_pressure_and_fuzzy_keep_one_strength(self):
        sensor='<params id="sensorslist"><ChildSensor id="pressure"><curve>0,.2;1,1;</curve></ChildSensor><ChildSensor id="fuzzy"><curve>0,.25;1,.75;</curve></ChildSensor></params>'
        d=self.brush({'PressureSize':'true','SizeValue':'.5','SizeSensor':sensor,'SizeUseSameCurve':'false'})
        t=d['sizeByPressure']['samples'];f=d['behavior']['modulations']['size'][0]
        self.assertEqual(f['control'],'random');self.assertAlmostEqual(t[0],.1);self.assertAlmostEqual(t[-1],.5)
        self.assertAlmostEqual(f['curve']['samples'][0],.25);self.assertAlmostEqual(f['curve']['samples'][-1],.75)
        self.assertAlmostEqual(t[-1]*f['curve']['samples'][0],.125)
if __name__=='__main__':unittest.main()
