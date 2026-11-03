"""Typed native source retention at the actual importer/portable boundary."""
import copy
import json
import os
from unittest.mock import patch
import tempfile
from pathlib import Path
import unittest
import convert
from krita_import import convert_krita,xml
from source_stamp_data import retain_source_stamp,validate_source_stamp_shape,validate_portable_source_stamp
from test_krita import kpp


def definition(generator='default',attrs='',brush=''):
    return f'<Brush type="auto_brush" {brush}><MaskGenerator id="{generator}" diameter="7" ratio=".5" type="rect" spikes="2" hfade=".2" vfade=".7" antialiasEdges="1" {attrs}/></Brush>'


class SourceAutoRetentionTests(unittest.TestCase):
    def test_auto_factory_reader_ignores_image_scale_version_and_keeps_initial_integer_geometry(self):
        raw=definition(brush='scale="9" BrushVersion="1" angle=".3"')
        data=retain_source_stamp({'brush_definition':raw},xml(raw),123,456,xml)
        self.assertEqual(data['version'],2);self.assertEqual(data['source']['kind'],'defaultAuto')
        self.assertEqual(data['brush'],{'width':7,'height':3,'scale':1,'angle':.3})
        self.assertEqual(data['spacing']['value'],1)
        self.assertEqual(len(data['options']),9)
        validate_source_stamp_shape({'sourceStamp':data})
        raw=definition(attrs='radius="3"')
        data=retain_source_stamp({'brush_definition':raw},xml(raw),1,1,xml)
        self.assertEqual(data['source']['diameter'],3);self.assertEqual(data['brush']['height'],1)

    def test_native_auto_decimal_profile_does_not_accept_python_only_numeric_spellings(self):
        for malformed in ('1_0','NaN','Infinity','0x1'):
            raw=definition().replace('diameter="7"',f'diameter="{malformed}"')
            with self.assertRaises(ValueError):retain_source_stamp({'brush_definition':raw},xml(raw),1,1,xml)

    def test_legacy_missing_tag_is_image_only_and_new_tagged_data_cannot_be_forged(self):
        raw='<Brush type="png_brush" filename="self.png" BrushVersion="1"/>'
        image=retain_source_stamp({'brush_definition':raw},xml(raw),3,5,xml)
        self.assertEqual(image['source'],{'kind':'image'});self.assertEqual(image['brush']['scale'],2)
        image.pop('source');image['version']=1;validate_source_stamp_shape({'sourceStamp':image})
        raw=definition();auto=retain_source_stamp({'brush_definition':raw},xml(raw),1,1,xml)
        for edit in (lambda d:d.update(version=1),lambda d:d.pop('source'),lambda d:d.update(source={'kind':'image'}),lambda d:d['source'].update(diameter=8),lambda d:d['brush'].update(scale=2)):
            data=copy.deepcopy(auto);edit(data)
            with self.assertRaises(ValueError):validate_source_stamp_shape({'sourceStamp':data})

    def test_actual_importer_retains_default_source_without_synthetic_bitmap_and_rejects_other_generators(self):
        with tempfile.TemporaryDirectory()as temp:
            root=Path(temp)
            for generator in ('default','gauss','soft','unknown'):
                path=root/(generator+'.kpp');path.write_bytes(kpp(definition(generator).replace('type="rect"','type="rct"')))
                catalog=convert.Catalog(root/('out-'+generator));convert_krita(path,catalog)
                self.assertFalse(catalog.skipped)
                row=catalog.brushes[0];d=row['descriptor']
                if generator=='default':
                    self.assertEqual(d['sourceStamp']['source']['kind'],'defaultAuto');self.assertNotIn('mask',d['tip'])
                    validate_source_stamp_shape(d)
                elif generator in ('gauss','soft'):
                    self.assertEqual(d['sourceStamp']['source']['kind'],'gaussianAuto' if generator=='gauss' else 'softAuto')
                    self.assertEqual(d['sourceStamp']['source']['shape'],'rect')
                    validate_source_stamp_shape(d)
                else:
                    self.assertNotIn('sourceStamp',d)
                    self.assertTrue(any(n['feature']=='sourceStampData' and n['status']=='unsupported' for n in row['compatibility']))

    def test_gaussian_circle_retains_raw_geometry_options_and_portable_binding(self):
        raw=definition('gauss',brush='scale="9" BrushVersion="1" angle=".3"').replace('type="rect"','type="circle"')
        data=retain_source_stamp({'brush_definition':raw},xml(raw),123,456,xml)
        self.assertEqual(data['source']['kind'],'gaussianAuto')
        self.assertEqual(data['source']['generator'],'gauss')
        self.assertEqual(data['brush'],{'width':7,'height':3,'scale':1,'angle':.3})
        self.assertEqual(len(data['options']),9)
        self.assertEqual(data['unsupported'],[])
        validate_source_stamp_shape({'sourceStamp':data})
        for edit in (lambda d:d['source'].update(generator='default'),lambda d:d['source'].update(kind='defaultAuto'),lambda d:d['source'].update(horizontalFade=.8),lambda d:d['brush'].update(height=4)):
            forged=copy.deepcopy(data);edit(forged)
            with self.assertRaisesRegex(ValueError,'differs from raw'):validate_source_stamp_shape({'sourceStamp':forged})
        rect=retain_source_stamp({'brush_definition':definition('gauss')},xml(definition('gauss')),1,1,xml)
        self.assertEqual(rect['source']['shape'],'rect')
        validate_source_stamp_shape({'sourceStamp':rect})
        with self.assertRaises(ValueError):
            retain_source_stamp({'brush_definition':definition('gauss').replace('diameter="7"','diameter="0"')},xml(definition('gauss').replace('diameter="7"','diameter="0"')),1,1,xml)

    def test_actual_gaussian_importer_retains_source_and_exception_without_material_grant(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for spikes in (2,9):
                raw=definition('gauss').replace('type="rect"','type="circle"').replace('spikes="2"',f'spikes="{spikes}"')
                path=root/(str(spikes)+'.kpp');path.write_bytes(kpp(raw,resources='<param name="PressureSoftness">true</param><param name="SoftnessUseCurve">false</param><param name="SoftnessValue">.1</param>' if spikes==9 else ''))
                catalog=convert.Catalog(root/('out-'+str(spikes)));convert_krita(path,catalog)
                self.assertFalse(catalog.skipped)
                descriptor=catalog.brushes[0]['descriptor'];data=descriptor['sourceStamp']
                self.assertEqual(data['source']['kind'],'gaussianAuto')
                self.assertEqual(data['source']['spikes'],spikes)
                self.assertNotIn('coverageProfile',data)
                validate_source_stamp_shape(descriptor)
                if spikes==9:
                    self.assertIn('gaussian-auto-mask-parameters-unavailable',data['unsupported'])
                    self.assertFalse(data['flags']['materialFixed1'])
                else:self.assertEqual(data['unsupported'],[])

    @unittest.skipUnless(os.environ.get('GRAFETTO_NATIVE_CURVE_COMPILER'),'explicit trusted native compiler integration')
    def test_all_seven_actual_stock_descriptors_recompile_and_forged_auto_coefficients_reject(self):
        fixture=Path(__file__).resolve().parents[2]/'packages/shared/src/fixtures/sourceDefaultAutoData/stock.native.ts'
        rows=json.loads(fixture.read_text().removeprefix('export default '))['rows'];self.assertEqual([r['index']for r in rows],[4,8,17,18,19,21,67])
        executable=os.environ['GRAFETTO_NATIVE_CURVE_COMPILER']
        for row in rows:validate_portable_source_stamp(row['descriptor'],executable)
        forged=copy.deepcopy(rows[1]['descriptor']);forged['sourceStamp']['compiled']['curves'][0]['coefficients'][0][0]+=1e-7
        validate_source_stamp_shape(forged)
        with patch('convert.base64.b64decode',side_effect=AssertionError('forged auto reached asset decode')):
            with self.assertRaisesRegex(ValueError,'differ from native compiler'):validate_portable_source_stamp(forged,executable)

    @unittest.skipUnless(os.environ.get('GRAFETTO_NATIVE_CURVE_COMPILER'),'explicit trusted native compiler integration')
    def test_actual_thirteen_gaussian_descriptors_recompile_and_reject_forged_data(self):
        fixture=Path(__file__).resolve().parents[2]/'packages/shared/src/fixtures/sourceGaussianAutoData/stock.native.ts'
        rows=json.loads(fixture.read_text().removeprefix('export default '))['rows']
        self.assertEqual([r['index'] for r in rows],[2,5,6,7,10,11,12,22,38,39,40,68,70])
        compiler=os.environ['GRAFETTO_NATIVE_CURVE_COMPILER']
        for row in rows:
            d=row['descriptor'];data=d['sourceStamp']
            self.assertEqual(data['source']['kind'],'gaussianAuto')
            self.assertEqual(data['unsupported'],[])
            self.assertEqual(len(data['options']),9)
            validate_portable_source_stamp(d,compiler)
        forged=copy.deepcopy(rows[0]['descriptor'])
        forged['sourceStamp']['compiled']['curves'][0]['coefficients'][0][0]+=1e-7
        validate_source_stamp_shape(forged)
        with patch('convert.base64.b64decode',side_effect=AssertionError('forged Gaussian reached asset decode')):
            with self.assertRaisesRegex(ValueError,'differ from native compiler'):validate_portable_source_stamp(forged,compiler)
        forged=copy.deepcopy(rows[0]['descriptor']);forged['sourceStamp']['source']['generator']='default'
        with self.assertRaisesRegex(ValueError,'differs from raw'):validate_portable_source_stamp(forged,compiler)
