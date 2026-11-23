"""Curve opacity follows native NotCheckable semantics."""
import base64
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from brush_contract import finalize_identity
from convert import Catalog, portable_bundle
from krita_import import convert_krita, _SOURCE_SCOPE
from test_sketch_spray194 import native194
from test_krita_size_strength import authored
from test_usecurve_yes_public import typed

class CurveOpacityScope(unittest.TestCase):
    def load(self, raw, bundle=False):
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            root=Path(tmp); path=root/('a.bundle' if bundle else 'a.kpp')
            if bundle:
                with ZipFile(path,'w') as z:
                    z.writestr('a.kpp',raw); z.writestr('b.kpp',authored({'PressureSize':'true'}))
            else: path.write_bytes(raw)
            cat=Catalog(root/'out'); convert_krita(path,cat,{})
            self.assertIsNone(_SOURCE_SCOPE.get())
            return cat.brushes,cat.skipped

    def test_canonical_flag_and_default_sensor(self):
        for checked in (None,'true','false','0'):
            for curve in (None,'true','false','1','0'):
                values={}
                if checked is not None: values['PressureOpacity']=checked
                if curve is not None: values['OpacityUseCurve']=curve
                for bundle in (False,True):
                    with self.subTest(checked=checked,curve=curve,bundle=bundle):
                        raw=native194('curvebrush',params=values)
                        records,skipped=self.load(raw,bundle)
                        self.assertEqual(skipped,[])
                        self.assertEqual(len(records),2 if bundle else 1)
                        descriptor=records[0]['descriptor']
                        self.assertEqual(descriptor['opacityByPressure'],[[0,1],[1,1]] if curve in ('false','0') else [[0,0],[1,1]])
                        self.assertEqual(descriptor['id'],finalize_identity(copy.deepcopy(descriptor),raw)['id'])

    def test_historical_descriptor_portable_and_new_import(self):
        fixture=Path(__file__).parent/'fixtures/curve-opacity/historical.json'
        raw_fixture=fixture.read_bytes()
        self.assertEqual(hashlib.sha256(raw_fixture).hexdigest(),'4a43b6ef10f47b37b0fa18f0c94affe1854e4e8089b032db84c2543ab70a73a8')
        history=json.loads(raw_fixture); raw=base64.b64decode(history['sourceBase64']); old=history['record']
        self.assertEqual(history['producer'],'21262f1bb')
        self.assertEqual(old['descriptor']['id'],'imported-fdca101d1631119ac6138b92')
        self.assertEqual(old['descriptor']['opacityByPressure'],[[0,1],[1,1]])
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            p=Path(tmp); library=p/'old.grafetto-brushes.json'
            library.write_text(json.dumps({'library':{'schemaVersion':1,'brushes':[old],'assets':[],'skipped':[]},'assets':{}}))
            restored=Catalog(p/'restore');portable_bundle(library,restored)
            self.assertEqual(restored.brushes,[old])
        records,skipped=self.load(raw)
        self.assertEqual(skipped,[])
        self.assertEqual(records[0]['descriptor']['opacityByPressure'],[[0,0],[1,1]])
        self.assertNotEqual(records[0]['descriptor']['id'],old['descriptor']['id'])

    def test_noncanonical_true_and_canonical_disabled(self):
        for rawvalue in ('yes','no','00',' true '):
            for checked in (None,'true','false'):
                values={'OpacityUseCurve':rawvalue}
                if checked is not None:values['PressureOpacity']=checked
                raw=native194('curvebrush',params=values)
                for bundle in (False,True):
                    records,skipped=self.load(raw,bundle)
                    self.assertEqual(len(records),int(bundle))
                    self.assertIn('Unsupported noncanonical OpacityUseCurve',str(skipped))
        for value in (b'true',b'1',b'yes'):
            raw=typed(native194('curvebrush',params={'OpacityUseCurve':'true'}),'OpacityUseCurve',value)
            self.assertIn('Unsupported noncanonical OpacityUseCurve',str(self.load(raw)[1]))
        for value in (b'false',b'0',b''):
            raw=typed(native194('curvebrush',params={'OpacityUseCurve':'true'}),'OpacityUseCurve',value)
            self.assertNotIn('Unsupported noncanonical OpacityUseCurve',str(self.load(raw)[1]))

if __name__ == '__main__': unittest.main()
