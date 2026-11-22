import base64
import copy
import json
import tempfile
import unittest
from pathlib import Path

from brush_contract import Catalog, finalize_identity
from krita_import import preset
from mypaint_import import mypaint_preset
from test_krita import kpp


class MyPaintLockAlphaTests(unittest.TestCase):
    def test_krita_ignores_valid_lock_alpha_but_standalone_retains_it(self):
        for base in (0, 0.5, 1):
            for inputs in ({}, {'pressure': [[0, 0], [1, 1]]}):
                with self.subTest(base=base, inputs=inputs), tempfile.TemporaryDirectory() as tmp:
                    raw=json.dumps({'version':3,'settings':{'lock_alpha':{'base_value':base,'inputs':inputs}}}).encode()
                    encoded=base64.b64encode(raw).decode()
                    source=kpp(engine='mypaintbrush',resources='<param name="MyPaint/json" type="bytearray">'+encoded+'</param>')
                    k=preset(source,'a.kpp',Catalog(Path(tmp)/'krita'),{})
                    s=mypaint_preset(raw,'a.myb',Catalog(Path(tmp)/'standalone'))
                    self.assertEqual(k['descriptor']['mypaint']['settings'],[])
                    self.assertEqual(s['descriptor']['mypaint']['settings'][0]['id'],41)
                    self.assertEqual(s['descriptor']['mypaint']['settings'][0]['base'],base)
                    self.assertEqual(len(s['descriptor']['mypaint']['settings'][0]['inputs']),len(inputs))
                    self.assertTrue(any(n['feature']=='mypaintLockAlpha' for n in k['compatibility']))
                    old=copy.deepcopy(k['descriptor']);old['mypaint']['settings']=s['descriptor']['mypaint']['settings']
                    self.assertNotEqual(k['descriptor']['id'],finalize_identity(old,source)['id'])

    def test_krita_lock_alpha_still_validates_base_and_mappings(self):
        for setting in ({'base_value':-0.01,'inputs':{}}, {'base_value':1.01,'inputs':{}},
                        {'base_value':0,'inputs':{'unknown':[[0,0],[1,1]]}},
                        {'base_value':0,'inputs':{'pressure':[[1,0],[0,1]]}}):
            with self.subTest(setting=setting), tempfile.TemporaryDirectory() as tmp:
                raw=json.dumps({'version':3,'settings':{'lock_alpha':setting}}).encode()
                with self.assertRaises(ValueError):
                    mypaint_preset(raw,'a.myb',Catalog(Path(tmp)),surface_policy='krita-legacy-v1')

