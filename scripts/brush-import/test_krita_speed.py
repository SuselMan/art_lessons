"""Source speed curves consume a captured, versioned input sensor."""
from pathlib import Path
import tempfile
import unittest
from PIL import Image,PngImagePlugin
import convert
from krita_import import convert_krita


class KritaSpeedTests(unittest.TestCase):
    def test_native_speed_curve_keeps_zero_and_records_view_calibration(self):
        preset='''<Preset name="Authored speed" paintopid="paintbrush">
        <param name="brush_definition"><![CDATA[<Brush type="auto_brush" spacing=".1"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>]]></param>
        <param name="PressureSize">true</param><param name="SizeSensor"><![CDATA[<params id="speed"><curve>0,1;1,0;</curve></params>]]></param>
        </Preset>'''
        meta=PngImagePlugin.PngInfo();meta.add_text('preset',preset,zip=True)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'speed.kpp';Image.new('RGB',(2,2),'white').save(p,format='PNG',pnginfo=meta)
            catalog=convert.Catalog(Path(tmp)/'out');convert_krita(p,catalog)
            self.assertEqual(catalog.skipped,[])
            brush=catalog.brushes[0];behavior=brush['descriptor']['behavior']
            self.assertEqual(behavior['speedInput'],{'version':1,'space':'view','maximum':30,'estimator':'grafettoEMA30ms'})
            control=behavior['modulations']['size'][0]
            self.assertEqual(control['control'],'speed')
            self.assertEqual(control['curve']['samples'][0],1)
            self.assertEqual(control['curve']['samples'][-1],0)
            self.assertTrue(any('approximates' in n['detail'] and 'estimator' in n['detail'] for n in brush['compatibility']))


if __name__=='__main__':unittest.main()
