import copy
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from review_ingest_fixed import sha, verify_build, normalize_reports
from review_fixed_matrix import MatrixError


class IngestTest(unittest.TestCase):
    def setup_case(self, root):
        build = root/'build';build.mkdir()
        files=[]
        for name in ('index.html','entry.js','worker.js'):
            data=name.encode();(build/name).write_bytes(data);files.append({'file':name,'sha256':sha(data)})
        (build/'manifest.json').write_text(json.dumps({'files':files}))
        actual=verify_build(build)
        batch=root/'batch';batch.mkdir()
        image=b'png';(batch/'image.png').write_bytes(image)
        raw=bytes([0,0,0,0]);compressed=gzip.compress(raw);(batch/'carrier.gz').write_bytes(compressed)
        source=actual['sourceHashes'];input_sha={'rgba':sha(raw),'water':'a'*64,'paper':'b'*64}
        choice={'key':'model:x','kind':'worker-factory','algorithm':'x','config':{},'label':'X'}
        plan={'choices':[choice],'matrix':[{'scene':'s'}],'registrySourceSHA256':'c'*64}
        manifest={'registrySHA':'c'*64,'choices':[choice],
                  'inputs':[{'id':'s','size':1,'sha':input_sha,'encoding':'optical-density','expectedDisplayDensityScale':1}],
                  'allowedBuilds':{'model:x':[{**actual,'policy':'initial-fixed-v1'}]}}
        audit={'pass':True,'rawSHA':sha(raw),'inputSHA':input_sha,'sourceHashes':source,
               'invalidPremulPixels':0,'changedDryChannels':0}
        result={'pass':True,'algorithm':'x','fixture':'s','config':{},'fixtureSHA':input_sha,'fixtureSHAAfter':input_sha,
                'inputUnchanged':True,'encoding':'optical-density','hashes':[sha(raw)],'repeatExact':True,
                'samples':[],'warmMedianMs':1,'requestedDomainPolicy':'initial-fixed-v1',
                'initialWetAudit':{'policy':'initial-raw-water-positive-v1','threshold':0,'dryIdentity':True,'changedDryChannels':0,'newPigmentDryPixels':0},
                'display':{'paperSource':'exact-input-paper'}}
        row={'pass':True,'fixedInitialWetVerified':True,'captureInputExact':True,'sameFixtureInput':True,
             'request':{'algorithm':'x','config':{},'encoding':'optical-density','fixedInitialWet':True,'expectedInputSHA':input_sha},
             'result':result,'rawAudit':audit,'commonRenderer':{'inputSHA':input_sha,'inputDerivedScale':True,'outputNormalized':False,'displayDensityScale':1,'paperSource':'exact-input-paper'},
             'png':{'file':'image.png','sha256':sha(image)},'carrier':{'file':'carrier.gz','gzipSHA256':sha(compressed),'decodedSHA256':sha(raw),'decodedBytes':4}}
        report={'pass':False,'contextClosed':True,'errors':[],'sourceHashes':source,'cases':[row,{'pass':False,'request':{'algorithm':'failed'}}]}
        file=batch/'report.json';file.write_text(json.dumps(report))
        return plan,manifest,actual,report,file

    def test_partial_ingestion_and_identical_dedup_never_import_failed_row(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);plan,manifest,build,report,file=self.setup_case(root)
            cells,diag=normalize_reports(plan,manifest,[file,file],[build],root/'out')
            self.assertEqual(len(cells),1)
            self.assertEqual(len(diag['failedOriginalRows']),2)
            self.assertEqual(len(diag['identicalDeduplicatedRows']),1)
            self.assertEqual(diag['rejectedRowsOrReports'],[])
            self.assertFalse(cells[0]['variant']['evidence']['batchScope']['reportPass'])
            self.assertFalse(json.loads(file.read_text())['pass'])

    def test_no_paper_proof_and_changed_source_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);plan,manifest,build,report,file=self.setup_case(root)
            report['cases'][0]['commonRenderer']['paperSource']='guessed';file.write_text(json.dumps(report))
            cells,diag=normalize_reports(plan,manifest,[file],[build],root/'out')
            self.assertEqual(cells,[]);self.assertEqual(len(diag['rejectedRowsOrReports']),1)
            (root/'build/worker.js').write_bytes(b'changed')
            with self.assertRaises(MatrixError):verify_build(root/'build')

    def test_conflicting_output_or_bound_gzip_cannot_silently_replace_cell(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);plan,manifest,build,report,file=self.setup_case(root)
            (file.parent/'carrier.gz').write_bytes(b'wrong')
            cells,diag=normalize_reports(plan,manifest,[file],[build],root/'out')
            self.assertEqual(cells,[]);self.assertEqual(len(diag['rejectedRowsOrReports']),1)


if __name__=='__main__':unittest.main()
