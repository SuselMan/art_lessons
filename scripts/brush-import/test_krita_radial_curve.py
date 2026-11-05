"""Independent closed-form source-law witnesses, no vendor brush pixels."""
import base64
import copy
import json
import math
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import convert
from krita_import import radial_curve_samples,radial_curve_lookup,convert_krita
from test_krita_size_strength import authored


def unpack(raw,count): return [word[0]/0xffffffff for word in struct.iter_unpack('>I',raw[:count*4])]
def alpha(samples,resolution,q):
    if q>1:return 0
    z=q*resolution;i=int(z);f=z-i
    return 255-int((1-((1-f)*samples[i]+f*samples[i+1]))*255)

def definition(diameter=1,curve='0,0;1,1',extra='',brush_extra=''):
    return f'<Brush type="auto_brush" randomness="0" density="1" {brush_extra}><MaskGenerator id="soft" type="circle" diameter="{diameter}" ratio=".2" spikes="2" antialiasEdges="0" softness_curve="{curve}" {extra}/></Brush>'

class RadialTests(unittest.TestCase):
    def test_authored_resolution_identity_and_native_endpoints(self):
        for diameter,r in [(.125,1),(1,4),(1.125,5),(55,220),(60,240),(75,300),(110,440),(600,2400)]:
            resolution,table=radial_curve_samples('0,0;1,1',diameter)
            self.assertEqual(resolution,r);self.assertEqual(len(table),r+2)
            for j,value in enumerate(table):self.assertEqual(value,j/(r+1))
            for i in range(r+1):
                for fraction in [0,.5]:
                    q=(i+fraction)/r
                    if q<=1:
                        expected=255-int((1-q*r/(r+1))*255)
                        self.assertLessEqual(abs(alpha(table,r,q)-expected),1)
            self.assertEqual(alpha(table,r,1.001),0)
        r,t=radial_curve_samples('0,0;1,1',1)
        self.assertEqual(alpha(t,r,.25),51);self.assertEqual(alpha(t,r,1),205)
        self.assertEqual(alpha(t,r,(.5/1)**2),51) # squared radius, not sqrt
        self.assertEqual(t[0],0);self.assertEqual(t[-1],1) # no sensor epsilon
    def test_outer_knots_corner_runs_and_nonzero_endpoints(self):
        for curve,law in [('.2,.3;.8,.9',lambda x:.3+max(0,min(.6,x-.2))),
                          ('0,.2;.5,.8,is_corner;1,.4',lambda x:.2+1.2*x if x<=.5 else 1.2-.8*x),
                          ('0,1;1,0',lambda x:1-x)]:
            r,t=radial_curve_samples(curve,1.125)
            for j,value in enumerate(t):self.assertAlmostEqual(value,law(j/(r+1)),places=14)
    def test_native_cubic_interior_clamp_before_packing(self):
        # Natural cubic through (0,0),(.5,.25),(1,1): M=[0,3,0].
        def law(x):return .25*x+x*x*x if x<=.5 else 1.5*x-.5+((2-2*x)**3-(2-2*x))*.125
        r,t=radial_curve_samples('0,0;.5,.25;1,1',1)
        for j,value in enumerate(t):self.assertAlmostEqual(value,law(j/(r+1)),places=14)
        self.assertEqual(alpha(t,r,.25),15)
        _,ring=radial_curve_samples('0,0;.25,1,is_corner;1,0',1.125)
        self.assertGreater(ring[2],ring[-1]);self.assertEqual(ring[0],0);self.assertEqual(ring[-1],0)
    def test_unorm32_pack_zero_padding_and_mask_quantization_bound(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=convert.Catalog(Path(tmp));warnings=[]
            p=radial_curve_lookup('0,.2;.5,.8,is_corner;1,.4',1.125,c,warnings)
            a=c.assets[p['lookup']];raw=(c.output/a['file']).read_bytes()
            self.assertEqual(a['size'],8);self.assertEqual(raw[28:],bytes(36));self.assertEqual(warnings,[])
            decoded=unpack(raw,7);r,source=radial_curve_samples('0,.2;.5,.8,is_corner;1,.4',1.125)
            for x,y in zip(source,decoded):self.assertLessEqual(abs(x-y),.5/0xffffffff+1e-16)
            for i in range(1001):self.assertLessEqual(abs(alpha(source,r,i/1000)-alpha(decoded,r,i/1000)),1)
    def imported(self,tmp,params):
        p=Path(tmp)/'test.kpp';p.write_bytes(authored(params));c=convert.Catalog(Path(tmp)/'out');convert_krita(p,c)
        self.assertEqual(c.skipped,[]);return c
    def test_static_gate_child_resolution_and_recursive_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            params={'brush_definition':definition(600),'MaskingBrush/Enabled':'true','MaskingBrush/MasterSizeCoeff':'.1','MaskingBrush/Preset/brush_definition':definition(110)}
            c=self.imported(tmp,params);d=c.brushes[0]['descriptor'];child=d['behavior']['dual']['brush']
            self.assertEqual((d['version'],child['version']),(31,31))
            self.assertEqual(d['tip']['profile']['resolution'],2400);self.assertEqual(child['tip']['profile']['resolution'],440)
            self.assertAlmostEqual(child['sizeByPressure'][0][1],.1)
            params['brush_definition']='<Brush type="auto_brush"><MaskGenerator id="default" type="circle" diameter="60" ratio="1"/></Brush>'
            c=self.imported(tmp,params);d=c.brushes[0]['descriptor']
            self.assertEqual(d['version'],31);self.assertEqual(d['behavior']['dual']['brush']['version'],31)
    def test_dynamic_or_threshold_fallback_and_invalid_source(self):
        for params in [{'PressureSoftness':'true'},{'PressureSoftness':'true','SoftnessUseCurve':'false','SoftnessValue':'1'}, {'PressureSharpness':'true','SharpnessUseCurve':'false'}]:
            with tempfile.TemporaryDirectory() as tmp:
                c=self.imported(tmp,{'brush_definition':definition(),**params});d=c.brushes[0]['descriptor']
                self.assertNotEqual(d['version'],31);self.assertNotIn('profile',d['tip']);self.assertEqual(d['tip']['kind'],'bitmap')
        for curve,diameter in [('0,0;0,1',1),('0,nan;1,0',1),('0,0;1,1',.001),('0,0;1,1',10001)]:
            with self.assertRaises(ValueError):radial_curve_samples(curve,diameter)
    def test_portable_lookup_integrity_capacity_and_combinations_atomic(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);c=self.imported(tmp,{'brush_definition':definition()});manifest=c.write()
            payloads={aid:base64.b64encode((c.output/a['file']).read_bytes()).decode() for aid,a in c.assets.items()}
            envelope={'library':manifest,'assets':payloads};path=root/'bundle.grafetto-brushes.json'
            path.write_text(json.dumps(envelope));convert.portable_bundle(path,convert.Catalog(root/'valid'))
            mutations=[lambda d:d['tip']['profile'].update(resolution=40000),
                       lambda d:d['tip']['profile'].update(lookup='asset:'+'a'*64),
                       lambda d:d['tip']['profile'].update(resolution=True),
                       lambda d:d['tip']['profile'].update(encoding='u8'),
                       lambda d:d['tip']['profile'].update(antialias=True),
                       lambda d:d['tip'].update(imageSampling={}),lambda d:d['tip'].update(alphaThreshold={'value':.5,'softness':0}),
                       lambda d:d['tip'].update(material={}),lambda d:d['tip'].update(animation={})]
            for i,mutate in enumerate(mutations):
                bad=copy.deepcopy(envelope);mutate(bad['library']['brushes'][0]['descriptor']);path.write_text(json.dumps(bad));out=convert.Catalog(root/f'bad{i}')
                with self.assertRaises(ValueError):convert.portable_bundle(path,out)
                self.assertEqual(list(out.output.iterdir()),[])
            with patch('krita_import.native_transfer',return_value=[[0,0],[1,1]]):
                p=radial_curve_lookup('0,0;1,1',.125,c,[]);self.assertEqual(c.assets[p['lookup']]['size'],4)

if __name__=='__main__':unittest.main()
