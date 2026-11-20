"""Exact native option keys opt in without reinterpreting historical hashes."""
import copy
from pathlib import Path
import tempfile
import unittest
import convert
from krita_import import sensor_controls,convert_krita
from test_krita_size_strength import authored

class KeyedRandomTests(unittest.TestCase):
    def test_exact_key_is_common_to_same_option_and_distinct_for_different_options(self):
        def control(option):return sensor_controls({option+'Sensor':'<params id="fuzzystroke"/>'},option,[])[0]
        a=control('Rotation');b=control('Rotation');c=control('Size')
        self.assertEqual(a['randomSource'],{'kind':'qt5Taus88','key':'RotationFuzzyStroke'})
        self.assertEqual(a['randomSource'],b['randomSource']);self.assertNotEqual(a['randomSource'],c['randomSource'])
        self.assertNotIn('randomStream',a)
        self.assertEqual(control('水彩🎨')['randomSource']['key'],'水彩🎨FuzzyStroke')
    def test_option_key_limit_uses_utf16_units_and_rejects_nul_or_empty_option(self):
        sensor='<params id="fuzzystroke"/>'
        for option in ['', 'A\0B','🎨'*59,'x'*118]:
            with self.assertRaises(ValueError):sensor_controls({option+'Sensor':sensor},option,[])
        self.assertEqual(len(sensor_controls({'x'*117+'Sensor':sensor},'x'*117,[])[0]['randomSource']['key']),128)
    def imported(self,params):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'test.kpp';path.write_bytes(authored(params));catalog=convert.Catalog(Path(tmp)/'out');convert_krita(path,catalog)
            self.assertEqual(catalog.skipped,[]);return catalog.brushes[0]['descriptor']
    def test_recursive_versions_keys_and_disabled_stale_child(self):
        params={'PressureRotation':'true','RotationSensor':'<params id="fuzzystroke"/>',
                'MaskingBrush/Enabled':'true','MaskingBrush/Preset/brush_definition':'<Brush type="auto_brush"><MaskGenerator type="circle" diameter="30" ratio="1"/></Brush>',
                'MaskingBrush/Preset/PressureRotation':'true','MaskingBrush/Preset/RotationSensor':'<params id="fuzzystroke"/>',
                'MaskingBrush/Preset/PressureSize':'false','MaskingBrush/Preset/SizeSensor':'<params id="fuzzystroke"/>'}
        d=self.imported(params);child=d['behavior']['dual']['brush']
        self.assertEqual((d['version'],child['version']),(32,32))
        control=lambda b:b['behavior']['rotation']['composition']['additive'][0]
        self.assertEqual(control(d)['randomSource'],control(child)['randomSource'])
        self.assertEqual(child['sizeByPressure'],[[0,1],[1,1]])
        self.assertNotIn('size',child['behavior'].get('modulations',{}))
        disabled={**params,'PressureRotation':'false','MaskingBrush/Preset/PressureRotation':'false'}
        old=self.imported(disabled);self.assertNotEqual(old['version'],32);self.assertNotEqual(old['behavior']['dual']['brush']['version'],32)
        only_child=self.imported({**params,'PressureRotation':'false'})
        self.assertEqual(only_child['version'],32)
    def test_portable_keyed_and_legacy_are_exclusive_and_bounded(self):
        source={'kind':'qt5Taus88','key':'RotationFuzzyStroke'}
        valid={'control':'strokeRandom','randomSource':source,'minimum':0,'jitter':0}
        convert.validate_portable_dynamics([valid]);convert.validate_portable_dynamics([{'control':'strokeRandom','randomStream':0xffffffff,'minimum':0,'jitter':0}])
        for patch in [{'randomStream':0}, {'randomSource':None},{'control':'random'}, {'randomSource':{'kind':'other','key':'RotationFuzzyStroke'}},
                      {'randomSource':{'kind':'qt5Taus88','key':''}}, {'randomSource':{'kind':'qt5Taus88','key':'a\0b'}},
                      {'randomSource':{'kind':'qt5Taus88','key':'🎨'*65}}, {'randomSource':{**source,'extra':1}}]:
            with self.assertRaises(ValueError):convert.validate_portable_dynamics([{**copy.deepcopy(valid),**patch}])

if __name__=='__main__':unittest.main()
