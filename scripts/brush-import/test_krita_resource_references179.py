import unittest,tempfile,io,hashlib,base64,json,os
from pathlib import Path
from PIL import Image
from test_krita import kpp
from krita_import import preset,convert_krita
from convert import Catalog,portable_bundle
ORIGINAL=Path(os.environ['GRAFETTO_RESOURCE179_BUNDLE']) if os.environ.get('GRAFETTO_RESOURCE179_BUNDLE') else None
class ResourceReferences179(unittest.TestCase):
 def image(self,alphas=(255,0,64,128)):
  image=Image.new('RGBA',(2,2));image.putdata([(0,0,0,a)for a in alphas]);f=io.BytesIO();image.save(f,format='PNG');return f.getvalue()
 def raw(self,reference,filename='Own.png'):
  return kpp('<Brush type="png_brush" filename="'+filename+'" spacing="0.1" brushApplication="0"/>',resources='<param name="Filter/id">posterize</param><param name="Filter/configuration"><![CDATA[<params><param name="steps">7</param></params>]]></param><param name="Filter/smudgeMode">true</param><resources>'+reference+'</resources>',engine='filter',mode='copy')
 def check(self,raw,external):
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp));r=preset(raw,'Own.kpp',c,external);d=r['descriptor'];self.assertEqual(d['version'],179);self.assertEqual((c.output/c.assets[d['tip']['mask']]['file']).read_bytes(),bytes([255,0,64,128]));return r
 @unittest.skipUnless(ORIGINAL is not None and ORIGINAL.is_file(), 'Set GRAFETTO_RESOURCE179_BUNDLE for optional original-bundle integration')
 def test_original179_four_unmodified_bundle_portable_whole(self):
  before=hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);c=Catalog(p/'native');convert_krita(ORIGINAL,c,{});self.assertEqual(c.skipped,[]);self.assertEqual(len(c.brushes),4);self.assertEqual({x['descriptor']['filter']['kind']for x in c.brushes},{'desaturate','posterize','gaussian','unsharp'});self.assertTrue(all(x['descriptor']['version']==179 for x in c.brushes));self.assertEqual(len(c.assets),1);self.assertEqual(next((c.output/a['file']).read_bytes()for a in c.assets.values()),bytes([255,0,64,128]));env={'library':c.write(),'assets':{a:base64.b64encode((c.output/v['file']).read_bytes()).decode()for a,v in c.assets.items()}};f=p/'own.grafetto-brushes.json';f.write_text(json.dumps(env));out=Catalog(p/'portable');portable_bundle(f,out);self.assertEqual(out.brushes,c.brushes);self.assertEqual(out.assets,c.assets)
  self.assertEqual(hashlib.sha256(ORIGINAL.read_bytes()).hexdigest(),before)
 def test_empty_reference_basename_callable_duplicate_identical_content(self):
  raw=self.image();self.check(self.raw('<resource filename="Own.png" type="brushes">  </resource>'),{'brushes/Own.png':lambda:raw,'also/Own.png':raw})
 def test_md5_disambiguates_then_preserves_binding_at_resource_lookup(self):
  raw=self.image();other=self.image((0,255,128,64));md5=hashlib.md5(raw).hexdigest().upper();ref='<resource filename="sub/Own.png" type="brushes" md5sum="'+md5+'"/>';self.check(self.raw(ref),{'a/Own.png':other,'b/Own.png':raw})
 def test_md5_can_resolve_renamed_external_without_filename_fallback(self):
  raw=self.image();md5=hashlib.md5(raw).hexdigest();self.check(self.raw('<resource filename="Own.png" type="brushes" md5sum="'+md5+'"/>'),{'renamed/Original.png':raw})
 def test_missing_mismatch_malformed_ambiguity_reject_before_output(self):
  raw=self.image();other=self.image((0,255,128,64))
  for ref,external in [('<resource filename="Own.png"/>',{}),('<resource filename="Own.png" md5sum="'+'0'*32+'"/>',{'Own.png':raw}),('<resource filename="Own.png" md5sum="bad"/>',{'Own.png':raw}),('<resource filename="Own.png"/>',{'a/Own.png':raw,'b/Own.png':other})]:
   with self.subTest(ref=ref),tempfile.TemporaryDirectory()as tmp:
    c=Catalog(Path(tmp))
    with self.assertRaises(ValueError):preset(self.raw(ref),'Bad.kpp',c,external)
    self.assertEqual(c.assets,{});self.assertEqual(c.brushes,[]);self.assertEqual(list(c.output.iterdir()),[])
 def test_external_valid_skips_nonempty_malformed_embedded_decode(self):
  raw=self.image();md5=hashlib.md5(raw).hexdigest();ref='<resource filename="Own.png" md5sum="'+md5+'">not-base64!!</resource>';self.check(self.raw(ref),{'brushes/Own.png':raw})
 def test_external_wrong_md5_valid_embedded_fallback_retains_exact_binding(self):
  raw=self.image();md5=hashlib.md5(raw).hexdigest();ref='<resource filename="sub/Own.png" md5sum="'+md5+'">'+base64.b64encode(raw).decode()+'</resource>';self.check(self.raw(ref),{'brushes/Own.png':self.image((0,255,128,64))})
 def test_old_nonempty_embedded_valid_full_record_unchanged_and_bad_checksum_denied(self):
  raw=self.image();md5=hashlib.md5(raw).hexdigest();ref='<resource filename="Own.png" md5sum="'+md5+'">'+base64.b64encode(raw).decode()+'</resource>';expected=json.loads(Path(__file__).with_name('pre-resource179-records.json').read_text())
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp));actual=preset(self.raw(ref),'Own.kpp',c,{});self.assertEqual(actual,expected['record']);self.assertEqual((c.output/c.assets[actual['descriptor']['tip']['mask']]['file']).read_bytes(),bytes([255,0,64,128]))
  with tempfile.TemporaryDirectory()as tmp:
   c=Catalog(Path(tmp))
   with self.assertRaises(ValueError):preset(self.raw(ref.replace(md5,'0'*32)),'Bad.kpp',c,{})
   self.assertEqual(c.assets,{});self.assertEqual(c.brushes,[])
 def test_named_md5_match_does_not_read_unrelated_lazy_archive_payloads(self):
  raw=self.image();md5=hashlib.md5(raw).hexdigest();calls=[0]
  def wanted():calls[0]+=1;return raw
  def unrelated():raise AssertionError('Unrelated lazy archive expanded')
  with tempfile.TemporaryDirectory()as tmp:
   data=kpp('<Brush type="png_brush" filename="Own.png" brushApplication="0"/>',resources='<resources><resource filename="Own.png" md5sum="'+md5+'"/></resources>');preset(data,'Pixel.kpp',Catalog(Path(tmp)),{'brushes/Own.png':wanted,'huge/Other.png':unrelated})
  self.assertEqual(calls,[1])
 def test_md5_fallback_caches_hashes_and_alias_callable_reads_without_retaining_unmatched(self):
  raw=self.image();other=self.image((0,255,128,64));md5=hashlib.md5(raw).hexdigest();calls=[0,0]
  def wanted():calls[0]+=1;return raw
  def unrelated():calls[1]+=1;return other
  refs='<resource filename="Own.png" md5sum="'+md5+'"/><resource filename="Alias.png" md5sum="'+md5+'"/>'
  with tempfile.TemporaryDirectory()as tmp:
   data=kpp('<Brush type="png_brush" filename="Own.png" brushApplication="0"/>',resources='<resources>'+refs+'</resources>');preset(data,'Pixel.kpp',Catalog(Path(tmp)),{'renamed/Wanted.png':wanted,'another/Wanted.png':wanted,'large/Unmatched.png':unrelated})
  self.assertEqual(calls,[1,1])
