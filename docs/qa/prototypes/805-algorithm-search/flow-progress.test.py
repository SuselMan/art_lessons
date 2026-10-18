"""CPU snapshot tests: never start devices/browser/services."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ProgressTest(unittest.TestCase):
    def test_counts_only_audited_unique_rows_and_discloses_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/'batch-000').mkdir()
            (root/'queue.json').write_text(json.dumps({'startedAt':'fixedUTC','planned':3780,'excluded':120}))
            sha={'rgba':'a'*64,'water':'b'*64,'paper':'c'*64};source={'worker.js':'d'*64};raw='e'*64
            row={'pass':True,'request':{'algorithm':'x','fixture':'s','config':{},'fixedInitialWet':True,'expectedInputSHA':sha},
                 'fixedInitialWetVerified':True,'sameFixtureInput':True,
                 'result':{'fixtureSHA':sha,'hashes':[raw]},'carrier':{'decodedSHA256':raw,'decodedBytes':4194304},
                 'rawAudit':{'pass':True,'sourceHashes':source,'inputSHA':sha,'rawSHA':raw,'changedDryChannels':0}}
            bad=copy.deepcopy(row);bad['request']['fixture']='bad';bad['rawAudit']['rawSHA']='0'*64
            failed={'pass':False,'failure':'secret/private/path must never be shown'}
            (root/'batch-000'/'report.json').write_text(json.dumps({'sourceHashes':source,'pass':False,'failure':'failed batch','cases':[row,row,bad,failed]}))
            subprocess.run([sys.executable,str(Path(__file__).with_name('flow-progress.py')),
                            '--output',str(root/'out.html'),'--worker-queue',str(root/'queue.json'),
                            '--progress-json',str(root/'out.json')],check=True)
            report=json.loads((root/'out.json').read_text())
            self.assertEqual(report['auditedUniqueRows'],1)
            self.assertEqual(report['closedBatchRows'],0)
            self.assertEqual(report['duplicateRows'],1)
            self.assertEqual(report['unverifiedRows'],1)
            self.assertEqual(report['failedRowsOrBatches'],2)
            self.assertFalse(report['complete'])
            output=(root/'out.html').read_text()
            self.assertIn('3780',output);self.assertIn('120',output)
            self.assertNotIn(str(root),output)
            self.assertNotIn('secret/private/path',output)


if __name__=='__main__':unittest.main()
