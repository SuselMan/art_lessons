import io,tempfile,unittest,json,base64,copy
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelOriginalDual151Tests(unittest.TestCase):
 def test_native_original_and_independent_mask_retained_portable_closed(self):
  for hsv in(False,True):
   with self.subTest(hsv=hsv),tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);p=root/'Own.kpp';mask='<Brush type="auto_brush" spacing="0.3" angle="0"><MaskGenerator type="circle" ratio="1" hfade="1" vfade="1"/></Brush>'
    options='<param name="PressureSize">true</param><param name="MaskingBrush/Enabled">true</param><param name="MaskingBrush/MaskingCompositeOp">multiply</param><param name="MaskingBrush/Preset/brush_definition"><![CDATA['+mask+']]></param>'
    if hsv:options+='<param name="Pressureh">true</param><param name="hSensor"><![CDATA[<params id="pressure"/>]]></param><param name="hUseCurve">true</param><param name="hValue">1</param>'
    p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="1"/>',resources=options));png=io.BytesIO();im=Image.new('RGBA',(2,2));im.putdata([(200,100,50,128),(10,20,30,255),(255,0,0,0),(100,150,200,64)]);im.save(png,format='PNG')
    out=convert.Catalog(root/'native');convert_krita(p,out,{'tip.png':png.getvalue()});self.assertEqual(out.skipped,[]);d=out.brushes[0]['descriptor'];self.assertEqual(d['version'],151);self.assertEqual(d['behavior']['dual']['sampling'],'independent');self.assertEqual(d['behavior']['dual']['blendMode'],'multiply');self.assertNotIn('color',d['behavior']['dual']['brush']['tip']);self.assertNotEqual(d['sizeByPressure'],[[0,1],[1,1]])
    if hsv:self.assertIn('hue',d['behavior']['colorAdjustment']);self.assertEqual(d['tip']['color']['adjustmentPolicy'],'native-image-stamp-v1')
    env={'library':out.write(),'assets':{aid:base64.b64encode((out.output/a['file']).read_bytes()).decode()for aid,a in out.assets.items()}};path=root/'own.grafetto-brushes.json';path.write_text(json.dumps(env));dest=convert.Catalog(root/'portable');convert.portable_bundle(path,dest);self.assertEqual(dest.brushes,out.brushes)
    for case in('downgrade','inline','childColor','erase','animation','childHSV','childModulationHSV'):
     bad=copy.deepcopy(env);b=bad['library']['brushes'][0]['descriptor']
     if case=='downgrade':b['version']=150
     elif case=='inline':b['behavior']['dual']['sampling']='inline'
     elif case=='childColor':b['behavior']['dual']['brush']['tip']=copy.deepcopy(b['tip'])
     elif case=='erase':b['behavior']['erase']=True
     elif case in('childHSV','childModulationHSV'):b['behavior']['dual']['brush']['behavior']['modulations'if case=='childModulationHSV'else'dynamics']={'brightness':[{'control':'pressure','minimum':0,'jitter':0}]if case=='childModulationHSV'else{'control':'pressure','minimum':0,'jitter':0}}
     else:b['tip']['animation']={'mode':'random','frames':[b['tip']['mask']]}
     path.write_text(json.dumps(bad));dest=convert.Catalog(root/case)
     with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(path,dest)
     self.assertEqual(dest.brushes,[]);self.assertEqual(dest.assets,{})
