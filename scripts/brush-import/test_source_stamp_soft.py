"""Soft source retention is data, not a radial compiler or raster grant."""
import copy
import tempfile
from pathlib import Path
import convert
from test_krita import kpp
from krita_import import convert_krita,soft_circle
import unittest
from krita_import import xml
from source_stamp_data import retain_source_stamp,validate_source_stamp_shape,source_stamp_budget


def retained(curve='0,1;.5,.4,is_corner;1,0',extra=''):
    raw=f'<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" ratio=".5" softness_curve="{curve}" {extra}/></Brush>'
    return retain_source_stamp({'brush_definition':raw},xml(raw),99,99,xml)


class SoftSourceTests(unittest.TestCase):
    def test_raw_curve_geometry_and_explicit_unavailable_author(self):
        data=retained(extra='radius="3"')
        self.assertEqual(data['source']['kind'],'softAuto')
        self.assertEqual(data['source']['softnessCurve']['points'][1],{'x':.5,'y':.4,'corner':True})
        self.assertEqual(data['brush'],{'width':3,'height':1,'scale':1,'angle':0})
        self.assertIn('soft-auto-raster-author-unavailable',data['unsupported'])
        validate_source_stamp_shape({'sourceStamp':data})
        self.assertEqual(retained('')['source']['softnessCurve']['text'],'0,1;1,0')

    def test_actual_importer_preserves_data_and_portable_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'soft.kpp'
            raw='<Brush type="auto_brush"><MaskGenerator id="soft" type="circle" diameter="7" ratio=".5" softness_curve="0,1;.5,.4,is_corner;1,0"/></Brush>'
            path.write_bytes(kpp(raw));catalog=convert.Catalog(root/'out')
            convert_krita(path,catalog)
            self.assertFalse(catalog.skipped)
            descriptor=catalog.brushes[0]['descriptor']
            self.assertEqual(descriptor['sourceStamp']['source']['kind'],'softAuto')
            validate_source_stamp_shape(descriptor)

    def test_default_legacy_mask_matches_pinned_factory_curve(self):
        actual=soft_circle(size=8)
        self.assertEqual(actual.tobytes(),soft_circle('0,1;1,0',size=8).tobytes())
        self.assertGreater(actual.getpixel((4,4)),actual.getpixel((6,4)))

    def test_raw_binding_and_geometry_forgery_rejected(self):
        for edit in [lambda d:d['source']['softnessCurve']['points'][1].update(y=.6),lambda d:d['source'].update(generator='gauss'),lambda d:d['brush'].update(scale=2),lambda d:d.update(version=1)]:
            data=retained();edit(data)
            with self.assertRaises(ValueError):validate_source_stamp_shape({'sourceStamp':data})
        for curve in ['0,1;0,.5;1,0','0,1;1,NaN','0,1,unknown;1,0',';'.join(f'{i/256},0' for i in range(257))]:
            with self.assertRaises(ValueError):retained(curve)

    def test_budget_includes_additional_curve_and_large_input_fails(self):
        data=retained();baseline=copy.deepcopy(data)
        del baseline['source']['softnessCurve'];baseline['source']['kind']='defaultAuto'
        curve=data['source']['softnessCurve']
        self.assertEqual(source_stamp_budget(data)-source_stamp_budget(baseline),len(curve['text'].encode())+32*len(curve['points']))
        with self.assertRaises(ValueError):retained('0,1;'+' '*65536+'1,0')
