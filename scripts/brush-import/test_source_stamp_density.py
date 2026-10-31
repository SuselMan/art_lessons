"""Normal importer opt-in; compiler boundary MOCKED with verified provider67 data."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import struct
import zipfile
import unittest
from unittest.mock import patch
import zlib
from PIL import Image, PngImagePlugin
from brush_contract import Catalog
from krita_import import preset, convert_krita, xml
from native_curve_arm_v3 import MappedCurveProvider
from source_stamp_data import required_source_curves, validate_source_stamp_shape, seeded_default_auto_material_domain

FIXTURE=json.loads((Path(__file__).parent/'fixtures/marker_dry_density.native.json').read_text())
PROFILE='neon64-f32-fma-seeded-density-v1'
PROVIDER=MappedCurveProvider('/explicit/fixture/compiler',FIXTURE['compiled']['buildId'])


def original():
    data=zlib.decompress(base64.b64decode(FIXTURE['kppDeflateBase64']))
    assert hashlib.sha256(data).hexdigest()==FIXTURE['kppSHA256']
    return data


def changed(**settings):
    image=Image.open(io.BytesIO(original())); image.load()
    root=xml(image.info['preset'])
    for key,value in settings.items():
        node=next((p for p in root.findall('param') if p.get('name')==key),None)
        if node is None:
            import xml.etree.ElementTree as ET
            node=ET.SubElement(root,'param',{'name':key})
        node.text=value
    import xml.etree.ElementTree as ET
    meta=PngImagePlugin.PngInfo();meta.add_text('preset',ET.tostring(root,encoding='unicode'))
    out=io.BytesIO();image.save(out,format='PNG',pnginfo=meta)
    return out.getvalue()


class DensityImporterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.catalog=Catalog(Path(self.tmp.name)/'assets')

    def compile(self,raw,provider):
        self.assertEqual(provider,PROVIDER)
        self.assertEqual(required_source_curves(raw),FIXTURE['requiredCurves'])
        return copy.deepcopy(FIXTURE['compiled'])

    def run_import(self,data=None,**kwargs):
        with patch('source_stamp_mapped.compile_mapped_source_stamp',side_effect=self.compile) as compiler:
            result=preset(data or original(),'e)_Marker_Dry.kpp',self.catalog,{},mapped_curve_provider=PROVIDER,**kwargs)
        self.assertEqual(compiler.call_count,1)
        return result

    def test_legacy_default_is_identical_and_retains_warnings(self):
        result=self.run_import()
        digest=hashlib.sha256(json.dumps(result,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
        self.assertEqual(digest,FIXTURE['legacyImportedSHA256'])
        self.assertEqual(result['descriptor']['tip']['kind'],'bitmap')
        self.assertTrue(any(n['feature']=='activeDynamics' for n in result['compatibility']))

    def test_explicit_normal_lowering_preserves_native_source_without_bitmap(self):
        result=self.run_import(source_material_profile=PROFILE)
        d=result['descriptor'];s=d['sourceStamp']
        self.assertEqual(d['tip']['kind'],'procedural');self.assertEqual(d['tip']['profile']['shape'],'rectangle')
        self.assertEqual(self.catalog.assets,{})
        self.assertEqual(s['source']['density'],.8);self.assertEqual(s['source']['diameter'],35)
        self.assertEqual(s['source']['ratio'],.5);self.assertEqual(s['brush']['angle'],1.5708)
        self.assertEqual(s['unsupported'],['default-auto-mask-parameters-unavailable'])
        self.assertEqual(s['compiled'],FIXTURE['compiled'])
        bits=b''.join(struct.pack('<d',x) for c in s['compiled']['curves'] for piece in c['coefficients'] for x in piece)
        self.assertEqual(hashlib.sha256(bits).hexdigest(),FIXTURE['coefficientF64LESHA256'])
        self.assertEqual(len(s['settings']),FIXTURE['retainedParameterCount'])
        self.assertEqual(len(xml(Image.open(io.BytesIO(original())).info['preset']).findall('param')),FIXTURE['originalParameterCount'])
        self.assertEqual(hashlib.sha256(json.dumps(s['settings'],sort_keys=True,separators=(',',':')).encode()).hexdigest(),FIXTURE['settingsSHA256'])
        validate_source_stamp_shape(d)
        self.assertFalse(any(n['status']=='unsupported' for n in result['compatibility']))
        self.assertTrue(any(n['feature']=='seededDensity' for n in result['compatibility']))

    def test_convert_entry_point_uses_same_opt_in(self):
        path=Path(self.tmp.name)/'marker.kpp';path.write_bytes(original())
        with patch('source_stamp_mapped.compile_mapped_source_stamp',side_effect=self.compile):
            convert_krita(path,self.catalog,source_material_profile=PROFILE,mapped_curve_provider=PROVIDER)
        self.assertEqual(self.catalog.skipped,[]);self.assertEqual(len(self.catalog.brushes),1)
        self.assertEqual(self.catalog.brushes[0]['descriptor']['tip']['kind'],'procedural')

    def test_bundle_entry_point_and_failed_convert_do_not_publish_fallback(self):
        path=Path(self.tmp.name)/'marker.bundle'
        with zipfile.ZipFile(path,'w') as archive:archive.writestr('paintoppresets/marker.kpp',original())
        with patch('source_stamp_mapped.compile_mapped_source_stamp',side_effect=self.compile):
            convert_krita(path,self.catalog,source_material_profile=PROFILE,mapped_curve_provider=PROVIDER)
        self.assertEqual(len(self.catalog.brushes),1);self.assertEqual(self.catalog.assets,{})
        failed=Catalog(Path(self.tmp.name)/'failed')
        with patch('source_stamp_mapped.compile_mapped_source_stamp',side_effect=ValueError('provider failed')):
            convert_krita(path,failed,source_material_profile=PROFILE,mapped_curve_provider=PROVIDER)
        self.assertEqual(failed.brushes,[]);self.assertEqual(failed.assets,{})
        self.assertEqual(failed.skipped,[{'name':'marker','reasons':['provider failed']}])

    def test_profile_requires_explicit_trusted_provider(self):
        for profile in (True,'other'):
            with self.subTest(profile=profile),self.assertRaises(ValueError):
                preset(original(),'marker.kpp',self.catalog,{},source_material_profile=profile,mapped_curve_provider=PROVIDER)
        with self.assertRaises(ValueError):preset(original(),'marker.kpp',self.catalog,{},source_material_profile=PROFILE)

    def test_compiler_failure_or_unbound_result_never_publishes(self):
        for value in (None,{**FIXTURE['compiled'],'buildId':'a'*64},{**FIXTURE['compiled'],'curves':[]}):
            with self.subTest(value=value),patch('source_stamp_mapped.compile_mapped_source_stamp',return_value=value),self.assertRaises(ValueError):
                preset(original(),'marker.kpp',self.catalog,{},source_material_profile=PROFILE,mapped_curve_provider=PROVIDER)
        with patch('source_stamp_mapped.compile_mapped_source_stamp',side_effect=ValueError('provider failed')),self.assertRaisesRegex(ValueError,'provider failed'):
            preset(original(),'marker.kpp',self.catalog,{},source_material_profile=PROFILE,mapped_curve_provider=PROVIDER)
        self.assertEqual(self.catalog.assets,{})

    def test_enabled_texture_other_active_effect_masking_and_erase_stay_closed(self):
        for settings in ({'Texture/Pattern/Enabled':'true'},{'PressureSharpness':'true'},
                         {'PressureUnimplemented':'true'},{'MaskingBrush/Enabled':'true'},
                         {'CompositeOp':'erase'},{'ColorSource/Type':'pattern'}):
            with self.subTest(settings=settings),self.assertRaises(ValueError):
                self.run_import(changed(**settings),source_material_profile=PROFILE)

    def test_density_frontier_cannot_hide_spikes_randomness_or_other_generator(self):
        root=xml(Image.open(io.BytesIO(original())).info['preset'])
        raw=next(p.text for p in root.findall('param') if p.get('name')=='brush_definition')
        for replacement in (raw.replace('spikes="2"','spikes="3"'),raw.replace('randomness="0"','randomness="0.2"'),raw.replace('id="default"','id="gauss"'),raw.replace('ratio="0.5"','ratio="0.01"'),raw.replace('diameter="35"','radius="36" diameter="35"')):
            self.assertNotEqual(replacement,raw)
            with self.subTest(raw=replacement),self.assertRaises(ValueError):
                self.run_import(changed(brush_definition=replacement),source_material_profile=PROFILE)

    def test_density_one_is_valid_but_never_retires_a_forged_reason(self):
        root=xml(Image.open(io.BytesIO(original())).info['preset'])
        raw=next(p.text for p in root.findall('param') if p.get('name')=='brush_definition')
        result=self.run_import(changed(brush_definition=raw.replace('density="0.8"','density="1"')),source_material_profile=PROFILE)
        source=result['descriptor']['sourceStamp']
        self.assertEqual(source['source']['density'],1)
        self.assertEqual(source['unsupported'],[])
        source['unsupported']=['default-auto-mask-parameters-unavailable']
        self.assertFalse(seeded_default_auto_material_domain(source))

    def test_raw_or_compiled_mutations_and_additional_reasons_fail_closed(self):
        source=self.run_import(source_material_profile=PROFILE)['descriptor']['sourceStamp']
        self.assertTrue(seeded_default_auto_material_domain(source))
        cases=[]
        for reasons in (source['unsupported']*2,source['unsupported']+['unknown'],['other']):
            item=copy.deepcopy(source);item['unsupported']=reasons;cases.append(item)
        item=copy.deepcopy(source);item['source']['randomness']=.1;cases.append(item)
        item=copy.deepcopy(source);item['flags']['materialFixed1']=False;cases.append(item)
        item=copy.deepcopy(source);item['role']='mask';cases.append(item)
        item=copy.deepcopy(source);item['compiled']['curves'][0]['coefficients']=[];cases.append(item)
        for item in cases:
            with self.subTest(item=item):self.assertFalse(seeded_default_auto_material_domain(item))

    def test_other_active_warning_is_retained_in_legacy_path(self):
        result=self.run_import(changed(PressureUnimplemented='true'))
        warnings=[n['detail'] for n in result['compatibility'] if n['feature']=='activeDynamics']
        self.assertEqual(len(warnings),1)
        self.assertIn('PressureUnimplemented',warnings[0])
        self.assertIn('PressureTexture/Strength/',warnings[0])


if __name__=='__main__':unittest.main()
