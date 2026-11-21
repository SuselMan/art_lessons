"""Synthetic Pixel lightness pipe with authored angular fan and HSV input."""
import base64,copy,json,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from test_krita_size_strength import authored
from test_krita_variable_gih import frame,rgba

class NativePixel202Tests(unittest.TestCase):
 def test_fan_pipe_and_combined_value_roundtrip_and_closed_scope(self):
  params={'brush_definition':'<Brush type="gbr_brush" filename="own.gih" brushApplication="2"/>','PaintOpAction':'2','PressureRotation':'true','RotationValue':'1','RotationSensor':'<params id="drawingangle" fanCornersEnabled="1" fanCornersStep="30" angleOffset="90"/>','Pressurev':'true','vValue':'.2','vUseCurve':'true','vUseSameCurve':'false','vSensor':'<params id="sensorslist"><ChildSensor id="fuzzy"/><ChildSensor id="distance" length="1200" periodic="1"/></params>'}
  gih=b'Own\n4 ncells:4 dim:2 rank0:2 sel0:angular rank1:2 sel1:incremental\n'+b''.join(frame(3,3,rgba(3,3),4) for _ in range(4))
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'b.kpp';p.write_bytes(authored(params));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,{'own.gih':gih});self.assertEqual(c.skipped,[])
   b=c.brushes[0];d=b['descriptor'];self.assertEqual(d['version'],202);self.assertEqual(d['behavior']['strokeInput']['fanCorners']['stepDegrees'],30)
   self.assertEqual(d['behavior']['colorAdjustment']['value']['combine']['policy'],'native-hsv-strength-v1')
   self.assertFalse(any(n['status']=='unsupported' for n in b['compatibility']))
   data={'library':c.write(),'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in c.assets.values()}}
   p=Path(tmp)/'brush.grafetto-brushes.json';p.write_text(json.dumps(data));out=convert.Catalog(Path(tmp)/'round');convert.portable_bundle(p,out);self.assertEqual(len(out.brushes),1)
   for i,edit in enumerate([lambda x:x['behavior']['rendering'].update(accumulation='directOver'),lambda x:x['behavior']['strokeInput'].pop('fanCorners'),lambda x:x['tip'].update(kind='round')]):
    bad=copy.deepcopy(data);edit(bad['library']['brushes'][0]['descriptor']);p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/('bad'+str(i)))
    with self.assertRaises(ValueError):convert.portable_bundle(p,out)
    self.assertEqual(list(out.output.iterdir()),[])
