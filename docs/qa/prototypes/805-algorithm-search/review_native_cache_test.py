import copy,hashlib,json,tempfile,unittest
from pathlib import Path
from review_native_cache import apply_native_cache

class NativeCache(unittest.TestCase):
 def test_matched_full_pixels_required_and_fill_stays_inside_each_sample(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);image=root/'same.png';image.write_bytes(b'png');sha=hashlib.sha256(image.read_bytes()).hexdigest()
   base=dict(id='original',**{'pass':True},repeatExact=True,sourceStable=True,contextClosed=True,errors=[],rawSHA={'raw':'same'},commonSHA={'input':'same'},hashes=[{'P':'p','C':'c','coverage':'cov'}]*3,png={'file':'same.png','sha256':sha},warmMedianMs=200)
   cache=copy.deepcopy(base);cache.update(expectedCanonicalCaptureExact=True,samples=[dict(glError=0,idleBeforeSampleMs=5000 if i else 0,nativeFeatherCache=dict(fillDraws=1,cacheHits=44)) for i in range(3)],nativeFeatherCache=dict(sourceID='805-native-feather-cache16-v1',prefixShaderGuards=2,sourceSHA={str(i):'a'*64 for i in range(4)}))
   pair={k:str(root/(k+'.json')) for k in ('control','cache')}
   def run(v):
    for key,value in [('control',base),('cache',v)]:Path(pair[key]).write_text(json.dumps(dict(cases=[dict(id='scene',variants=[value],**{'pass':True})],**{'pass':True})))
    scenes=[dict(id='scene',commonInputSHA={'input':'same'},variants=[dict(id='original',imageSource=str(image))])];apply_native_cache(scenes,[pair]);return scenes
   self.assertEqual(run(cache)[0]['variants'][1]['id'],'native-feather-cache')
   for fault in ['raw','pixels','fill','pause','source','closed']:
    v=copy.deepcopy(cache)
    if fault=='raw':v['rawSHA']={'raw':'different'}
    if fault=='pixels':v['hashes'][1]={'P':'wrong'}
    if fault=='fill':v['samples'][1]['nativeFeatherCache']['fillDraws']=0
    if fault=='pause':v['samples'][1]['idleBeforeSampleMs']=1
    if fault=='source':v['nativeFeatherCache']['sourceSHA']={}
    if fault=='closed':v['contextClosed']=False
    with self.subTest(fault=fault),self.assertRaises(ValueError):run(v)
if __name__=='__main__':unittest.main()
