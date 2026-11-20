import base64,copy,json,struct,subprocess,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from captured_bristle import compile_bristle,install_bristle,validate_portable_bristle

class CapturedBristleTest(unittest.TestCase):
    def ink(self):return dict(depletion=[0.,1.],useOpacity=True,useSaturation=True,useWeights=False,pressureWeight=.5,bristleLengthWeight=.5,bristleInkAmountWeight=.5,inkDepletionWeight=50.)
    def response(self):
        raw=bytearray(64);struct.pack_into('<II',raw,0,0x42525339,1);struct.pack_into('<I',raw,60,64)
        return SimpleNamespace(returncode=0,stdout=json.dumps(dict(version=1,profileSha256='a'*64,byteLength=64,bytes=base64.b64encode(raw).decode(),quality={'diagnostic':True})).encode(),stderr=b'Warning: disabling flag --expose_wasm due to conflicting flags')
    def test_trusted_binary_preserved_and_warning_not_fatal(self):
        with patch('captured_bristle.subprocess.run',return_value=self.response())as run:
            lookup,asset,raw,quality=compile_bristle(self.ink())
        self.assertEqual(len(raw),64);self.assertEqual(asset['size'],8);self.assertEqual(lookup['byteLength'],64)
        self.assertEqual(quality,{'diagnostic':True})
        args,kwargs=run.call_args;self.assertEqual(args[0][0:4],['node','--jitless','--v8-pool-size=1','--max-old-space-size=96']);self.assertEqual(kwargs['timeout'],20)
        self.assertEqual(json.loads(kwargs['input']),self.ink())
    def test_timeout_and_missing_compiler_fail_closed(self):
        for error in (OSError('missing'),subprocess.TimeoutExpired('node',20)):
            with self.subTest(error=type(error).__name__),patch('captured_bristle.subprocess.run',side_effect=error):
                with self.assertRaisesRegex(ValueError,'unavailable or timed out'):compile_bristle(self.ink())
    def test_invalid_input_never_starts_child(self):
        for key,value in [('depletion',[0.,float('nan')]),('useWeights',1),('pressureWeight',1.1)]:
            ink=self.ink();ink[key]=value
            with patch('captured_bristle.subprocess.run')as run:
                with self.assertRaises(ValueError):compile_bristle(ink)
                run.assert_not_called()
    def test_rejected_or_bad_child_never_installs(self):
        with tempfile.TemporaryDirectory()as folder:
            catalog=SimpleNamespace(output=Path(folder),assets={})
            for response in (SimpleNamespace(returncode=1,stdout=b'',stderr=b''),SimpleNamespace(returncode=0,stdout=b'{}',stderr=b'')):
                with patch('captured_bristle.subprocess.run',return_value=response):
                    with self.assertRaises(ValueError):install_bristle(self.ink(),catalog)
                self.assertEqual(catalog.assets,{});self.assertEqual(list(Path(folder).iterdir()),[])
    def test_portable_always_regenerates_and_rejects_forgery(self):
        with patch('captured_bristle.subprocess.run',return_value=self.response())as run:
            lookup,asset,raw,_=compile_bristle(self.ink());descriptor={'version':93,'bristle':{'version':2,'ink':self.ink(),'saturationLookup':lookup}}
            validate_portable_bristle(descriptor,{asset['id']:raw});self.assertEqual(run.call_count,2)
            forged=copy.deepcopy(descriptor);forged['bristle']['saturationLookup']['profileSha256']='b'*64
            with self.assertRaisesRegex(ValueError,'does not match'):validate_portable_bristle(forged,{asset['id']:raw})
            with self.assertRaisesRegex(ValueError,'does not match'):validate_portable_bristle(descriptor,{asset['id']:raw[:-1]+b'1'})
            self.assertEqual(run.call_count,4)
    def test_single_sample_and_future_revision_keep_compiler_contract(self):
        ink=dict(self.ink(),depletion=[0.])
        with patch('captured_bristle.subprocess.run',return_value=self.response())as run:
            lookup,asset,raw,_=compile_bristle(ink)
            descriptor={'version':94,'bristle':{'version':2,'ink':ink,'saturationLookup':lookup}}
            validate_portable_bristle(descriptor,{asset['id']:raw});self.assertEqual(run.call_count,2)
            descriptor['version']=True
            with self.assertRaises(ValueError):validate_portable_bristle(descriptor,{asset['id']:raw})
            self.assertEqual(run.call_count,2)
    def test_known_unsupported_has_bounded_compatibility_reason(self):
        from captured_bristle import BristleSaturationUnsupported
        result=SimpleNamespace(returncode=2,stdout=b'',stderr=b'jitless warning\n'+json.dumps({'kind':'unsupported','reason':'Insufficient representative saturation quality-screen coverage','quality':{'limit':.01}}).encode())
        with patch('captured_bristle.subprocess.run',return_value=result):
            with self.assertRaisesRegex(BristleSaturationUnsupported,'quality-screen coverage'):compile_bristle(self.ink())
        result.stderr=b'{"kind":"unsupported","reason":"'+b'x'*257+b'"}'
        with patch('captured_bristle.subprocess.run',return_value=result):
            with self.assertRaisesRegex(ValueError,'compilation rejected'):compile_bristle(self.ink())
    def test_no_saturation_preserves_old_and_forbids_claim(self):
        descriptor={'version':72,'bristle':{'version':2,'ink':dict(self.ink(),useSaturation=False)}}
        with patch('captured_bristle.subprocess.run')as run:
            validate_portable_bristle(descriptor,{})
            descriptor['bristle']['saturationLookup']={}
            with self.assertRaises(ValueError):validate_portable_bristle(descriptor,{})
            run.assert_not_called()
if __name__=='__main__':unittest.main()
