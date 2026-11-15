"""Genuine native/public-entry timing195 and immutable older-input boundaries."""
import copy,json,tempfile,unittest
from pathlib import Path
from brush_contract import Catalog
from krita_import import convert_krita,preset,DEFAULT_NATIVE_INPUT_POLICY
from native_timing195 import native_timing,clock_enabled,TIMING195
from timing195_corpus import corpus195,write_bundle195

class NativeTiming195Tests(unittest.TestCase):
    def test_canonical_native_bundle_all_family_roles_and_default_rates(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);path=root/'original.bundle';write_bundle195(path);c=Catalog(root/'out');convert_krita(path,c)
            self.assertEqual(c.skipped,[])
            self.assertEqual(len(c.brushes),len(corpus195()))
            records={Path(r['source']).stem:r for r in c.brushes}
            for name,engine,data in corpus195():
                d=records[name]['descriptor'];self.assertEqual(d['version'],195,name)
                t=d['behavior']['timing'];self.assertEqual(t['version'],2);self.assertIs(type(t['updateSpacingBetweenDabs']),bool)
                if name.startswith('host-default-'):self.assertEqual((t['rate'],t['hostRate']),(20,1),name)
            self.assertEqual(records['host-rate-zero']['descriptor']['behavior']['timing']['hostRate'],0)
            self.assertNotIn('rateDynamics',records['mypaint-ignored-rate']['descriptor']['behavior']['timing'])
            self.assertTrue(records['spacing-refresh']['descriptor']['behavior']['timing']['updateSpacingBetweenDabs'])
            for sensor in('pressure','fuzzy','fuzzystroke','xtilt','declination','time','speed','distance','rotation','tangentialpressure'):
                t=records['rate-'+sensor]['descriptor']['behavior']['timing'];self.assertIn('rateDynamics',t,sensor)
            self.assertEqual(records['rate-fuzzy']['descriptor']['behavior']['timing']['rateDynamics'][0]['randomSource']['kind'],'grafettoSourceTime-v1')
            self.assertEqual(records['rate-fuzzystroke']['descriptor']['behavior']['timing']['rateDynamics'][0]['randomSource'],{'kind':'qt5Taus88','key':'RateFuzzyStroke'})
    def test_all_native195_records_portable_roundtrip_and_CAS(self):
        import base64,convert
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);write_bundle195(root/'own.bundle');c=Catalog(root/'out');convert_krita(root/'own.bundle',c)
            self.assertEqual(c.skipped,[])
            envelope={'library':c.write(),'assets':{key:base64.b64encode((c.output/value['file']).read_bytes()).decode()for key,value in c.assets.items()}}
            path=root/'own.grafetto-brushes.json';path.write_text(json.dumps(envelope));out=Catalog(root/'portable');convert.portable_bundle(path,out)
            self.assertEqual(out.brushes,c.brushes);self.assertEqual(out.assets,c.assets)
            self.assertTrue(all(not any(n['status']=='unsupported'for n in record['compatibility'])for record in c.brushes))
    def test_whole_portable_rejects_malformed_timing_and_nested195_before_publication(self):
        import base64,convert
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp);write_bundle195(root/'own.bundle');c=Catalog(root/'out');convert_krita(root/'own.bundle',c)
            records={Path(r['source']).stem:r for r in c.brushes}
            base={'library':{'schemaVersion':1,'brushes':[records['pixel-independent-child-time']],'assets':list(c.assets.values()),'skipped':[]},'assets':{k:base64.b64encode((c.output/v['file']).read_bytes()).decode()for k,v in c.assets.items()}}
            for kind in('version','hostRateMissing','hostRateNaN','hostRateBool','spacingMissing','spacingNumber','extra','nested','childLegacy','noTiming'):
                envelope=copy.deepcopy(base);d=envelope['library']['brushes'][0]['descriptor'];t=d['behavior']['timing']
                if kind=='version':t['version']=1
                elif kind=='hostRateMissing':t.pop('hostRate')
                elif kind=='hostRateNaN':t['hostRate']=float('nan')
                elif kind=='hostRateBool':t['hostRate']=True
                elif kind=='spacingMissing':t.pop('updateSpacingBetweenDabs')
                elif kind=='spacingNumber':t['updateSpacingBetweenDabs']=1
                elif kind=='extra':t['callback']='effective'
                elif kind=='nested':d['behavior']['dual']['brush']['version']=195
                elif kind=='childLegacy':d['behavior']['dual']['brush']['version']=132
                elif kind=='noTiming':d['behavior'].pop('timing')
                path=root/(kind+'.grafetto-brushes.json');path.write_text(json.dumps(envelope));out=Catalog(root/('bad-'+kind))
                with self.subTest(kind=kind),self.assertRaises(ValueError):convert.portable_bundle(path,out)
                self.assertEqual(out.assets,{});self.assertEqual(list(out.output.iterdir()),[])
    def test_native_identity_and_retained_semantics_are_independent_of_output_paths(self):
        with tempfile.TemporaryDirectory()as tmp:
            root=Path(tmp)
            for name,engine,raw in corpus195():
                c=Catalog(root/('a-'+name));a=preset(raw,name+'.kpp',c,{},_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY)
                z=preset(raw,name+'.kpp',Catalog(root/('b-'+name)),{},_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY)
                self.assertEqual(a,z,name)
                if name=='pixel-independent-child-time':
                    child=a['descriptor']['behavior']['dual']['brush'];self.assertEqual(child['version'],190);self.assertNotIn('timing',child['behavior']);self.assertTrue(any(x.get('control')=='time'for x in child['behavior']['modulations']['size']))
                if name=='spray-canonical-source':self.assertEqual(a['descriptor']['spray']['color']['sourcePolicy'],'canonical-begin-v1')
                if name.startswith('tangent-sharpness-line'):self.assertTrue(a['descriptor']['tangentNormal']['sharpnessChecked'])
    def test_exact_native_interval_floor_bounds_and_portable_boolean_contract(self):
        from stationary195 import validate_timing195
        from convert import validate_portable_dynamics
        base={'version':2,'rate':20,'hostRate':1,'ignoreDistanceSpacing':False,'updateSpacingBetweenDabs':False}
        for key,factor in(('rate',1000),('hostRate',500)):
            accepted={**base,key:factor/(2147483647+.5)};validate_timing195(accepted,validate_portable_dynamics)
            for value in(factor/2147483648,1e-30):
                with self.subTest(key=key,value=value),self.assertRaises(ValueError):validate_timing195({**base,key:value},validate_portable_dynamics)
        for key in('PaintOpSettings/ignoreSpacing','PaintOpSettings/updateSpacingBetweenDabs'):
            with self.subTest(key=key),self.assertRaises(ValueError):native_timing({key:'not-a-bool'},'deformbrush')
    def test_native_bytearray_rate_sensor_resolves_before_compiling_and_keeps_original_identity(self):
        import base64,io,xml.etree.ElementTree as ET
        from PIL import Image
        from native_mask190 import png_preset
        raw=next(data for name,engine,data in corpus195()if name=='rate-time')
        node=ET.fromstring(Image.open(io.BytesIO(raw)).info['preset']);p=next(p for p in node.findall('param')if p.get('name')=='RateSensor');p.set('type','bytearray');p.text=base64.b64encode(p.text.encode()).decode();encoded=png_preset(node)
        with tempfile.TemporaryDirectory()as tmp:
            a=preset(raw,'same.kpp',Catalog(Path(tmp)/'plain'),{},_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY)['descriptor'];b=preset(encoded,'same.kpp',Catalog(Path(tmp)/'encoded'),{},_default_input_policy=DEFAULT_NATIVE_INPUT_POLICY)['descriptor']
            self.assertEqual(a['behavior'],b['behavior']);self.assertNotEqual(a['id'],b['id'])
    def test_context_is_explicit_and_resets_after_failure(self):
        p={'PaintOpSettings/isAirbrushing':'true','PressureSize':'true'}
        self.assertTrue(clock_enabled(p,'PaintOpSettings/isAirbrushing'))
        token=TIMING195.set(True)
        try:self.assertFalse(clock_enabled(p,'PaintOpSettings/isAirbrushing'));self.assertTrue(clock_enabled(p,'PressureSize'))
        finally:TIMING195.reset(token)
        self.assertTrue(clock_enabled(p,'PaintOpSettings/isAirbrushing'));self.assertEqual(p['PaintOpSettings/isAirbrushing'],'true')
    def test_numeric_bounds_defaults_and_native_ignored_rate(self):
        for value in('-1','1001','nan','inf','bad','1e-20'):
            with self.subTest(value=value),self.assertRaises(ValueError):native_timing({'PaintOpSettings/rate':value},'deformbrush')
        self.assertEqual(native_timing({},'deformbrush')[0],{'version':2,'rate':20,'hostRate':1,'ignoreDistanceSpacing':False,'updateSpacingBetweenDabs':False})
        t,_=native_timing({'PressureRate':'true','RateSensor':'<params id="unknown"/>'},'duplicate');self.assertNotIn('rateDynamics',t)
        with self.assertRaises(ValueError):native_timing({'PressureRate':'true','RateSensor':'<params id="unknown"/>'},'deformbrush')
    def test_legacy_explicit_false_and_noncanonical_alias_are_not_promoted(self):
        from test_krita import kpp
        with tempfile.TemporaryDirectory()as tmp:
            c=Catalog(Path(tmp)/'out')
            source=kpp(resources='<param name="PaintOpSettings/isAirbrushing">true</param>');a=preset(source,'old.kpp',c,{},timed_input=True);self.assertNotEqual(a['descriptor']['version'],195)
            path=Path(tmp)/'alias.kpp';path.write_bytes(kpp(resources='<param name="AirbrushOption/isAirbrushing">true</param>'));convert_krita(path,c);self.assertFalse(any(r['descriptor']['version']==195 for r in c.brushes))
            self.assertFalse(TIMING195.get())

if __name__=='__main__':unittest.main()
