from pathlib import Path
import tempfile,unittest,struct,json,hashlib
from test_krita import kpp
from brush_contract import Catalog
from krita_import import preset
from native_ignored_options import strip_unused_native_flow
import xml.etree.ElementTree as ET

def convert(family,extra=''):
    engine={'bristle':'hairybrush','hatching':'hatchingbrush','sketch':'sketchbrush','curve':'curvebrush'}[family]
    definition='<Brush type="gbr_brush" filename="hair.gbr" scale="1" ColorAsMask="1"/>'if family=='bristle'else None
    options='<param name="Sketch/simpleMode">true</param>'if family=='sketch'else''
    kwargs={'engine':engine,'resources':options+extra}
    if definition:kwargs['definition']=definition
    data=kpp(**kwargs)
    name=b'hair\0';gbr=struct.pack('>7I',28+len(name),2,4,4,1,0x47494d50,25)+name+bytes([255]*16)
    with tempfile.TemporaryDirectory()as directory:return preset(data,'test.kpp',Catalog(Path(directory)),{'hair.gbr':gbr})
def rendering(result):return{k:v for k,v in result['descriptor'].items()if k!='id'}
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()

GOLDENS={'bristle': '3efac5ed1a4e27fb4ce850f3b86d854f97929c925ed03caa66c58944f4d03a1f', 'hatching': '8e9991b20dec57ae2fc0fc39b2b9f4ae79a194a3ca2d9da3a3839005a5ae28cd', 'sketch': '0be2b96eed5c541bb0ece596e34d998b61d661a8bb8e97b307d97cbe87149996', 'curve': '66dd6323ccc5af0867d690086177224225b155b888cbb48a0ac7dc6e5dcf6cc9'}

class NativeIgnoredFlowTests(unittest.TestCase):
    def test_absent_and_unit_are_exact_old_rendering(self):
        for family in GOLDENS:
            for extra in ('','<param name="FlowValue">1</param>'):
                with self.subTest(family=family,extra=extra):self.assertEqual(digest(rendering(convert(family,extra))),GOLDENS[family])
    def test_stale_flow_does_not_change_rendering_or_default(self):
        for family in GOLDENS:
            baseline=convert(family)
            for flow in ('0','.25','.75','1'):
                with self.subTest(family=family,flow=flow):
                    result=convert(family,'<param name="FlowValue">'+flow+'</param>')
                    self.assertEqual(rendering(result),rendering(baseline));self.assertEqual(result['sourceDefaults'],baseline['sourceDefaults']);self.assertEqual(result['warnings'],baseline['warnings'])
    def test_invalid_unused_sensor_ignored_but_active_opacity_retained(self):
        opacity='<param name="PressureOpacity">true</param><param name="OpacityUseCurve">false</param><param name="OpacityValue">0.25</param>'
        stale='<param name="FlowValue">0.75</param><param name="PressureFlow">true</param><param name="FlowUseCurve">true</param><param name="FlowSensor"><![CDATA[not XML]]></param><param name="FlowcurveMode">999</param>'
        for family in GOLDENS:
            with self.subTest(family=family):
                baseline=convert(family,opacity);result=convert(family,opacity+stale)
                self.assertEqual(rendering(result),rendering(baseline));self.assertEqual(result['descriptor']['opacity'],.25);self.assertEqual(result['warnings'],baseline['warnings'])
                self.assertFalse(any(n['feature'].startswith('Flow')and n['status']=='unsupported'for n in result['compatibility']))
                self.assertTrue(any(n['feature']=='ignoredNativeFlow'for n in result['compatibility']))
    def test_exact_whitelist_retains_unrelated_keys(self):
        root=ET.fromstring('<Preset><param name="FlowValue">.25</param><param name="Flowper">retain</param><param name="PressureOpacity">true</param><param name="FlowFuture">keep</param></Preset>')
        self.assertTrue(strip_unused_native_flow(root));self.assertEqual([n.get('name')for n in root],['Flowper','PressureOpacity','FlowFuture'])
