"""Public import rejects four source-confirmed checked-flag losses."""
import copy
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from brush_contract import Catalog, finalize_identity
from krita_import import convert_krita, preset, _SOURCE_SCOPE
from test_usecurve_yes_public import typed
from test_krita_size_strength import authored
from test_sketch_spray194 import native194
from test_child_clock132 import params132, resources132


class PressureBoolGuard(unittest.TestCase):
    def load(self, raw, resources=None, bundle=False):
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            root=Path(tmp);path=root/('pair.bundle' if bundle else 'one.kpp')
            if bundle:
                with ZipFile(path,'w') as z:
                    z.writestr('bad.kpp',raw);z.writestr('good.kpp',authored({'PressureSize':'true'}))
            else:path.write_bytes(raw)
            catalog=Catalog(root/'out');convert_krita(path,catalog,resources or {})
            return catalog.brushes,catalog.skipped

    def make(self, role, checked, usecurve='true', typed_checked=False, **extra):
        option={'size':'Size','scatter':'Scatter','sketch':'Line width','child':'MaskingBrush/Preset/Size'}[role]
        flag=('MaskingBrush/Preset/PressureSize' if role=='child' else 'Pressure'+option)
        params={flag:checked,option+'UseCurve':usecurve,option+'Sensor':'<params id="pressure"/>',**extra}
        if role=='child':params={**params132(),'PaintOpAction':'2','MaskingBrush/Enabled':'true',**params}
        raw=native194('sketchbrush',params=params) if role=='sketch' else authored(params)
        return (typed(raw,flag,checked.encode()) if typed_checked else raw), flag

    def test_noncanonical_checked_is_rejected_in_kpp_and_bundle(self):
        for role in ('size','scatter','sketch','child'):
            for value in ('yes','no'):
                for typed_checked in (False,True):
                    for bundle in (False,True):
                        with self.subTest(role=role,value=value,typed=typed_checked,bundle=bundle):
                            raw,flag=self.make(role,value,typed_checked=typed_checked)
                            brushes,skipped=self.load(raw,resources132() if role=='child' else None,bundle)
                            self.assertEqual(len(brushes),int(bundle));self.assertIn('Unsupported noncanonical '+flag,str(skipped))
                            self.assertIsNone(_SOURCE_SCOPE.get())

    def test_canonical_and_disabled_curve_controls(self):
        for role in ('size','scatter','sketch','child'):
            for checked in ('true','false'):
                raw,_=self.make(role,checked)
                brushes,skipped=self.load(raw,resources132() if role=='child' else None)
                self.assertEqual(skipped,[]);self.assertEqual(len(brushes),1)
            for checked in ('yes','no'):
                neutral={'MaskingBrush/Preset/SizeValue':'1'} if role=='child' else {}
                raw,flag=self.make(role,checked,usecurve='false',**neutral)
                _,skipped=self.load(raw,resources132() if role=='child' else None)
                self.assertNotIn('Unsupported noncanonical '+flag,str(skipped))

    def test_inactive_mask_and_buildup_do_not_gain_guard(self):
        for extra in ({'MaskingBrush/Enabled':'false'},{'PaintOpAction':'1'}, {'PaintOpAction':'02','MaskingBrush/Enabled':'false'}):
            raw,flag=self.make('child','yes',**extra)
            _,skipped=self.load(raw,resources132())
            self.assertNotIn('Unsupported noncanonical '+flag,str(skipped))

    def test_typed_action_and_mask_boundaries(self):
        raw,flag=self.make('child','no')
        for action,active in ((b'1',False),(b'2',True),(b'0',True)):
            _,skipped=self.load(typed(raw,'PaintOpAction',action),resources132())
            self.assertEqual('Unsupported noncanonical '+flag in str(skipped),active)
        for mask,active in ((b'false',False),(b'0',False),(b'true',True)):
            _,skipped=self.load(typed(raw,'MaskingBrush/Enabled',mask),resources132())
            self.assertEqual('Unsupported noncanonical '+flag in str(skipped),active)

    def test_accepted_kpp_keeps_identity_derived_from_original_bytes(self):
        raw,_=self.make('size','true')
        brushes,skipped=self.load(raw)
        self.assertEqual(skipped,[])
        descriptor=brushes[0]['descriptor']
        self.assertEqual(finalize_identity(copy.deepcopy(descriptor),raw)['id'],descriptor['id'])

    def test_checked_size_constant_with_disabled_curve(self):
        for role in ('size','child'):
            field='MaskingBrush/Preset/SizeValue' if role=='child' else 'SizeValue'
            for value,expected in (('.52',True),('1',False)):
                raw,flag=self.make(role,'yes',usecurve='false',**{field:value})
                _,skipped=self.load(raw,resources132() if role=='child' else None)
                self.assertEqual('Unsupported noncanonical '+flag in str(skipped),expected)

    def test_private_adapter_does_not_gain_public_guard(self):
        raw,_=self.make('size','yes')
        with tempfile.TemporaryDirectory(dir='/dev/shm') as tmp:
            result=preset(raw,'private.kpp',Catalog(Path(tmp)),{},_adapter_private=True)
            self.assertIsNotNone(result['descriptor']);self.assertIsNone(_SOURCE_SCOPE.get())


if __name__=='__main__':unittest.main()
