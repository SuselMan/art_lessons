"""Self-contained format derivatives; source identity remains original-byte based."""
import copy,tempfile,unittest
from pathlib import Path
import convert
from krita_import import convert_krita
from krita_spray import spray_source146_scope
from test_spray_wash133 import authored133
class SpraySource146(unittest.TestCase):
    def test_native_sample_promotes_after_complete_descriptor_background_only_keeps43(self):
        for flags,version in [({'ColorOption/sampleInputColor':'true'},146),({'ColorOption/mixBgColor':'true'},76),({'ColorOption/fillBackground':'true'},76),({},43)]:
            with tempfile.TemporaryDirectory()as tmp:
                raw,res,_=authored133(False,'1',flags);p=Path(tmp)/'own.kpp';p.write_bytes(raw);c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,res)
                self.assertEqual(c.skipped,[]);d=c.brushes[0]['descriptor'];self.assertEqual(d['version'],version);self.assertEqual(spray_source146_scope(d),version==146)
                if version==146:
                    self.assertEqual(d['spray']['color']['sourcePolicy'],'canonical-begin-v1')
                    for key,val in [('version',145),('mixer',None)]:
                        bad=copy.deepcopy(d);bad[key]=val;self.assertFalse(spray_source146_scope(bad))
    def test_wash_sample_unsupported_remains_rejected_not_reinterpreted(self):
        with tempfile.TemporaryDirectory()as tmp:
            raw,res,_=authored133(False,'2',{'ColorOption/sampleInputColor':'true'});p=Path(tmp)/'own.kpp';p.write_bytes(raw);c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c,res);self.assertEqual(c.brushes,[]);self.assertTrue(c.skipped)
    def test_portable_roundtrip_and_whole_root_rejections_before_outputs(self):
        import base64,json
        with tempfile.TemporaryDirectory()as tmp:
            raw,res,_=authored133(False,'1',{'ColorOption/sampleInputColor':'true'});p=Path(tmp)/'own.kpp';p.write_bytes(raw);native=convert.Catalog(Path(tmp)/'native');convert_krita(p,native,res)
            env={'library':native.write(),'assets':{aid:base64.b64encode((native.output/a['file']).read_bytes()).decode()for aid,a in native.assets.items()}};p=Path(tmp)/'own.grafetto-brushes.json';p.write_text(json.dumps(env));good=convert.Catalog(Path(tmp)/'good');convert.portable_bundle(p,good);self.assertEqual(good.brushes,native.brushes)
            for case in('revision','policy','sample','child','dual','image','erase','foreign','badCDF','unknownColor'):
                bad=copy.deepcopy(env);d=bad['library']['brushes'][0]['descriptor'];b=d['behavior'];c=d['spray']['color']
                if case=='revision':d['version']=145
                elif case=='policy':c['sourcePolicy']='current'
                elif case=='sample':c.pop('sampleInput')
                elif case=='child':
                    child=copy.deepcopy(d);d.pop('spray');d['version']=45;b['dual']={'brush':child,'sampling':'independent','blendMode':'normal'}
                elif case=='dual':b['dual']=None
                elif case=='image':d['spray']['particle']['image']=True
                elif case=='erase':b['erase']=True
                elif case=='foreign':d['clone']=None
                elif case=='badCDF':d['spray']['angular']='invalid'
                else:c['unrecognized']=True
                p.write_text(json.dumps(bad));out=convert.Catalog(Path(tmp)/case)
                with self.subTest(case=case),self.assertRaises(ValueError):convert.portable_bundle(p,out)
                self.assertEqual(out.brushes,[]);self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
