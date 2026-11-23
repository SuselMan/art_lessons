"""Tangent Flow bool guard covers both BuildUp and Wash, not renderer parity."""
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from convert import Catalog
from krita_import import convert_krita, _SOURCE_SCOPE
from test_sketch_spray194 import native194
from test_krita_size_strength import authored
from test_usecurve_yes_public import typed

class TangentFlowBoolGuard(unittest.TestCase):
    def load(self, raw, bundle=False):
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            p=Path(tmp); path=p/('a.bundle' if bundle else 'a.kpp')
            if bundle:
                with ZipFile(path,'w') as z:
                    z.writestr('a.kpp',raw); z.writestr('b.kpp',authored({'PressureSize':'true'}))
            else: path.write_bytes(raw)
            cat=Catalog(p/'out');convert_krita(path,cat,{})
            self.assertIsNone(_SOURCE_SCOPE.get())
            return cat.brushes,cat.skipped

    def test_noncanonical_active_both_modes(self):
        for action in ('1','2'):
            for checked in (None,'true','false'):
                for curve in ('yes','no','00',' true '):
                    params={'PaintOpAction':action,'FlowUseCurve':curve,'FlowSensor':'<params id="pressure"/>'}
                    if checked is not None:params['PressureFlow']=checked
                    raw=native194('tangentnormal',params=params)
                    for bundle in (False,True):
                        with self.subTest(action=action,checked=checked,curve=curve,bundle=bundle):
                            records,skipped=self.load(raw,bundle)
                            self.assertEqual(len(records),int(bundle))
                            self.assertIn('Unsupported noncanonical FlowUseCurve',str(skipped))

    def test_canonical_and_typed_bool(self):
        for value in ('true','false','1','0',''):
            raw=native194('tangentnormal',params={'FlowUseCurve':value})
            self.assertNotIn('Unsupported noncanonical FlowUseCurve',str(self.load(raw)[1]))
        raw=native194('tangentnormal',params={'FlowUseCurve':'true'})
        for value in (b'true',b'1',b'yes'):
            self.assertIn('Unsupported noncanonical FlowUseCurve',str(self.load(typed(raw,'FlowUseCurve',value))[1]))
        for value in (b'false',b'0',b''):
            self.assertNotIn('Unsupported noncanonical FlowUseCurve',str(self.load(typed(raw,'FlowUseCurve',value))[1]))

if __name__ == '__main__': unittest.main()
