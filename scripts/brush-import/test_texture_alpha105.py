"""Authored native KPP/PNG through real importer/full portable validator."""
import unittest,tempfile,io,copy,json,base64
from pathlib import Path
from PIL import Image
import convert
from test_krita import kpp
from krita_import import convert_krita
class TextureAlpha105Tests(unittest.TestCase):
 def fixture(self,root,mode=4,extra=None,engine='colorsmudge'):
  params={'Texture/Pattern/Enabled':'true','Texture/Pattern/PatternFileName':'pattern.png','Texture/Pattern/TexturingMode':str(mode),'Texture/Pattern/UseSoftTexturing':'true','SmudgeRateUseNewEngine':'true','SizeUseCurve':'false',**(extra or {})}
  # test_krita.kpp already supplies SizeUseCurve: replace it exactly once.
  params.pop('SizeUseCurve');xml=''.join('<param name="'+k+'"><![CDATA['+v+']]></param>'for k,v in params.items())
  data=kpp('<Brush type="png_brush" filename="tip.png" brushApplication="0"/>',resources=xml,engine=engine)
  path=root/'original.kpp';path.write_bytes(data)
  def png(image):
   out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()
  pattern=Image.new('L',(3,2));pattern.putdata([0,64,128,192,255,32])
  tip=Image.new('RGBA',(4,4),(0,0,0,128));c=convert.Catalog(root/'catalog')
  convert_krita(path,c,{'pattern.png':png(pattern),'tip.png':png(tip)});return c
 def portable(self,root,c,descriptor=None):
  lib={'schemaVersion':1,'brushes':copy.deepcopy(c.brushes),'assets':list(c.assets.values()),'skipped':[]}
  if descriptor:lib['brushes'][0]['descriptor']=descriptor
  value={'library':lib,'assets':{a['id']:base64.b64encode((c.output/a['file']).read_bytes()).decode()for a in lib['assets']}}
  path=root/'fixture.grafetto-brushes.json';path.write_text(json.dumps(value));out=convert.Catalog(root/'portable');convert.portable_bundle(path,out);return out
 def test_all_four_alpha_raws_both_engines_full_portable(self):
  for engine in ('paintbrush','colorsmudge'):
   for raw,mode in ((6,'colorDodge'),(7,'colorBurn'),(10,'hardMixPhotoshop'),(11,'hardMixSofterPhotoshop')):
    for soft in ('false','true'):
     with tempfile.TemporaryDirectory()as tmp:
      root=Path(tmp);c=self.fixture(root,raw,{'Texture/Pattern/UseSoftTexturing':soft},engine);self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],105);self.assertEqual(d['texture']['application'],{'mode':mode,'soft':soft=='true'});self.assertEqual(self.portable(root,c).brushes[0]['descriptor'],d)
 def test_downgrade_child_and_modern_source_reject_before_outputs(self):
  for kind in ('version','child','projection','legacy','badsoft','extra'):
   with tempfile.TemporaryDirectory()as tmp:
    root=Path(tmp);c=self.fixture(root,6);d=copy.deepcopy(c.brushes[0]['descriptor'])
    if kind=='version':d['version']=104
    elif kind=='projection':d['mixer']['source']='projectionCanvas'
    elif kind=='legacy':d['mixer'].pop('algorithm')
    elif kind=='badsoft':d['texture']['application']['soft']=1
    elif kind=='extra':d['texture']['application']['unrecognized']=True
    else:
     child=copy.deepcopy(d);d.pop('mixer');d.pop('texture');d['model']='stamp';d['behavior']['dual']={'brush':child,'blendMode':'multiply'}
    with self.assertRaises(ValueError):self.portable(root,c,d)
    out=root/'portable';self.assertFalse(any(out.iterdir()))
 def test_raw2_and3_not_reclassified_as_alpha(self):
  for raw in (2,3):
   with tempfile.TemporaryDirectory()as tmp:
    c=self.fixture(Path(tmp),raw);self.assertEqual(c.skipped,[]);self.assertNotIn('application',c.brushes[0]['descriptor'].get('texture',{}));self.assertTrue(any(n['feature']=='textureApplication'and n['status']=='unsupported'for n in c.brushes[0]['compatibility']))
