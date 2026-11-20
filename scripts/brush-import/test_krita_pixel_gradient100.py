import io,tempfile,unittest,copy,json,base64
from pathlib import Path
from PIL import Image
import convert
from krita_import import convert_krita
from test_krita import kpp
class PixelFilteredGradientTests(unittest.TestCase):
 def genuine(self):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);p=root/'Filtered.kpp';p.write_bytes(kpp('<Brush type="png_brush" filename="tip.png" brushApplication="3" AdjustmentVersion="2"/>'))
   im=Image.new('RGBA',(2,2));im.putdata([(0,0,0,255),(255,255,255,0),(64,64,64,128),(192,192,192,64)]);raw=io.BytesIO();im.save(raw,format='PNG');c=convert.Catalog(root/'out');convert_krita(p,c,{'tip.png':raw.getvalue()});self.assertEqual(c.skipped,[])
   library=c.write();assets={a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in library['assets']};return library,assets
 def portable(self,library,assets):
  with tempfile.TemporaryDirectory()as tmp:
   root=Path(tmp);p=root/'portable.json';p.write_text(json.dumps({'library':library,'assets':assets}));out=convert.Catalog(root/'out');convert.portable_bundle(p,out);return out
 def test_explicit100_native_import_and_both_historical_defaults(self):
  library,assets=self.genuine();d=library['brushes'][0]['descriptor'];self.assertEqual(d['version'],100);self.assertEqual(d['tip']['color']['gradient']['sampling'],'filteredGray-v1');self.assertEqual(len(self.portable(library,assets).brushes),1)
  for version in(97,100,150):
   old=copy.deepcopy(library);old['brushes'][0]['descriptor']['version']=version;del old['brushes'][0]['descriptor']['tip']['color']['gradient']['sampling'];self.assertEqual(len(self.portable(old,assets).brushes),1)
 def test_sampling_revision_unknown_child_and_mixer_are_explicitly_closed(self):
  library,assets=self.genuine()
  bad=copy.deepcopy(library);bad['brushes'][0]['descriptor']['version']=99
  with self.assertRaises(ValueError):self.portable(bad,assets)
  bad=copy.deepcopy(library);bad['brushes'][0]['descriptor']['tip']['color']['gradient']['sampling']='unknown'
  with self.assertRaises(ValueError):self.portable(bad,assets)
  bad=copy.deepcopy(library);parent=copy.deepcopy(bad['brushes'][0]['descriptor']);parent['tip']={'kind':'round','hardness':1,'aspect':1,'angle':0,'rotation':'fixed'};parent['behavior']['dual']={'brush':bad['brushes'][0]['descriptor'],'blendMode':'multiply'};bad['brushes'][0]['descriptor']=parent
  with self.assertRaises(ValueError):self.portable(bad,assets)
  bad=copy.deepcopy(library);d=bad['brushes'][0]['descriptor'];d['model']='mixer';d['mixer']={'load':0,'pickup':1,'strength':1,'initialLoad':0,'source':'previousCanvas','algorithm':'krita-stamp'}
  with self.assertRaises(ValueError):self.portable(bad,assets)
