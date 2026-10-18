import copy
import hashlib
import json
import pathlib
import struct
import tempfile
import unittest
import zlib
from review_curtis import normalize_row,append_complete_curtis,PRIMARY,STEPS,read_closed_reports
from review_native_scope import KEEP_KEYS


def png():
    def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1024,1024,8,6,0,0,0))+chunk(b'IDAT',zlib.compress((b'\0'+b'\0\0\0\xff'*1024)*1024))+chunk(b'IEND',b'')


class CurtisTest(unittest.TestCase):
    def fixture(self,root):
        sha={k:'a'*64 for k in ('rgba','water','paper')};item=dict(id='s',sha=sha,encoding='optical-density',binarySHA256='b'*64,sourceScale=.7)
        build=dict(buildManifestSHA256='c'*64,sourceHashes={'entry.js':'d'*64},fixtures={'s':item})
        gate=dict(passed=True,bitExact=True,rgbaFloat=True,glError=0,highpBits=23)
        report=dict(pass_=True,sourceStable=True,contextClosed=True,errors=[],sourceHashes=build['sourceHashes'],buildManifestSHA=build['buildManifestSHA256'],ready=dict(float32Gate=gate));report['pass']=report.pop('pass_')
        image=png();(root/'image.png').write_bytes(image);h=hashlib.sha256(image).hexdigest()
        result=dict(fixture='s',steps=16,repeats=3,inputSHA=sha,inputBinarySHA='b'*64,encoding='optical-density',sourceScale=.7,
                    inputUnchanged=True,inputSHAAfter=sha,float32Gate=gate,metadata=dict(format='RGBA32F/FLOAT',backend='WebGL2 GLSL300 explicit highp output',size=1024,grid=1024,fixedInitialDomain=True,waterMode='dynamic',floatGate=dict(halfFallback=False,actualRead=[1.000244140625,.12345679,-.25,4]),auditPreClamp=True),
                    metrics=dict(nonfinite=0,negative=0,dryChanged=0,outsideMaterial=0,outsideWater=0,initial=[1]*4,final=[1]*4,ratios=[1]*4,preClampNegative=0,preClampScope='last step only'),
                    hashes=['e'*64]*3,stateHashes=[dict(G='1'*64,D='2'*64,W='3'*64)]*3,samples=[dict(primaryScope=PRIMARY,outputReadBytes=1024*1024*16,initSubmitMs=1,initReadyMs=2,initFenceWaitMs=1,initFence=dict(api="WebGL2 fenceSync/clientWaitSync",terminalStatus="CONDITION_SATISFIED",glStatus=37148,polls=2,timeoutNs=0,requestedPollDelayMs=1,flushed=True),computeAndReadMs=7,runSubmitMs=3,outputCombineAndReadMs=4,totalReadyMs=9,diagnosticRawReadMs=10)]*3,
                    repeatExact=True,outputSHA='e'*64,pngSHA=h)
        row=dict(pass_=True,request=dict(fixture='s',steps=16,repeats=3),result=result,png=dict(file='image.png',sha256=h));row['pass']=row.pop('pass_')
        return report,row,build

    def test_wide_float_checkpoint_timing_not_dry_goal(self):
        with tempfile.TemporaryDirectory()as d:
            root=pathlib.Path(d);report,row,build=self.fixture(root);row['result']['metrics']['wideChannels']=5
            out=normalize_row(report,row,build,root)
            self.assertFalse(out['zeroStep']);self.assertEqual(out['variant']['timeMs'],7)
            self.assertFalse(out['variant']['comparable']);self.assertIn('промежуточное',out['variant']['label'])
            self.assertEqual(out['variant']['gridResolution']['transportGrid'],1024)

    def test_bad_float_precision_repeat_guard_timer_and_png_rejected(self):
        with tempfile.TemporaryDirectory()as d:
            root=pathlib.Path(d)
            for fault in ('half','repeat','dry','preclamp','boundary','fence','timing','input','png'):
                report,row,build=self.fixture(root)
                if fault=='half':row['result']['metadata']['floatGate']['actualRead'][0]=1
                if fault=='repeat':row['request']['repeats']=row['result']['repeats']=1
                if fault=='dry':row['result']['metrics']['dryChanged']=1
                if fault=='preclamp':row['result']['metrics']['preClampNegative']=1
                if fault=='boundary':row['result']['samples'][0]['outputReadBytes']=4*1024*1024
                if fault=='fence':row['result']['samples'][0]['initFence']['terminalStatus']='TIMEOUT_EXPIRED'
                if fault=='timing':row['result']['samples'][0]['totalReadyMs']=10
                if fault=='input':row['result']['inputBinarySHA']='0'*64
                if fault=='png':(root/'image.png').write_bytes(b'broken')
                with self.subTest(fault=fault),self.assertRaises(ValueError):normalize_row(report,row,build,root)

    def test_separate_closed_reports_require_full_fixture_and_reject_prefix(self):
        with tempfile.TemporaryDirectory() as d:
            root=pathlib.Path(d);report,row,build=self.fixture(root)
            cases=[]
            for steps in (0,*STEPS):
                c=copy.deepcopy(row);c['request']['steps']=c['result']['steps']=steps
                if not steps:
                    c['result']['metrics'].update(maxIdentityError=0,zeroEncodedMismatch=0,identityDisplayChanged=0)
                cases.append(c)
            context=dict(browserContextId='b',targetId='t',sessionId='s');report['operatorContext']=context
            for c in cases:
                c['executionScope']={**context,'candidateLifetime':'fresh candidate for each single-repeat request','workerBinding':'Frozen entry creates one worker and routes every request through that same worker; responses carry distinct request IDs'}
                c['executionRequests']=[]
                for i in range(3):
                    request={**c['request'],'repeats':1};result=copy.deepcopy(c['result']);result.update(id=i,repeats=1)
                    for key in ('samples','hashes','stateHashes'):result[key]=result[key][:1]
                    a=json.dumps(request);b=json.dumps(result)
                    c['executionRequests'].append(dict(request=request,result=result,requestJSON=a,responseJSON=b,requestSHA256=hashlib.sha256(a.encode()).hexdigest(),responseSHA256=hashlib.sha256(b.encode()).hexdigest(),operatorContext=context,actualResponseId=i))
            report['cases']=cases;p=root/'report.json';p.write_text(json.dumps(report))
            result=read_closed_reports([p],build,['s'])
            self.assertEqual(len(result['rows']),5)
            self.assertEqual(result['reports'][0]['reportSHA256'],hashlib.sha256(p.read_bytes()).hexdigest())
            original=copy.deepcopy(report)
            bad=report['cases'][1]['executionRequests'][0];bad['result']['metrics']['dryChanged']=1;bad['responseJSON']=json.dumps(bad['result']);bad['responseSHA256']=hashlib.sha256(bad['responseJSON'].encode()).hexdigest();p.write_text(json.dumps(report))
            with self.assertRaises(ValueError):read_closed_reports([p],build,['s'])
            report=original;p.write_text(json.dumps(report))
            with self.assertRaises(ValueError):read_closed_reports([p,p],build,['s'])
            with self.assertRaises(ValueError):read_closed_reports([],build,['s'])
            report.pop('contextClosed');p.write_text(json.dumps(report))
            with self.assertRaises(ValueError):read_closed_reports([p],build,['s'])
            report['contextClosed']=True;report['cases']=cases[:-1];p.write_text(json.dumps(report))
            with self.assertRaises(ValueError):read_closed_reports([p],build,['s'])

    def test_complete_cross_product_required_without_mutating_native(self):
        data=dict(variantCatalog=[dict(key=k,label=k)for k in KEEP_KEYS],scenes=[dict(id='s',variants=[dict(id=k,comparisonKey=k)for k in KEEP_KEYS])]);before=copy.deepcopy(data)
        rows=[dict(sceneId='s',zeroStep=True)]+[dict(sceneId='s',zeroStep=False,variant=dict(id='curtis-'+str(n),comparisonKey='requested:curtis-virtual-pipes-f32:'+str(n),label=str(n)))for n in STEPS]
        result=append_complete_curtis(data,rows);self.assertEqual(len(result['variantCatalog']),9);self.assertEqual(len(result['scenes'][0]['variants']),9);self.assertEqual(data,before)
        with self.assertRaises(ValueError):append_complete_curtis(data,rows[:-1])
        with self.assertRaises(ValueError):append_complete_curtis(data,rows[1:])
        with self.assertRaises(ValueError):append_complete_curtis(data,rows+[rows[-1]])


if __name__=='__main__':unittest.main()
