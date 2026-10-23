from pathlib import Path
import json,hashlib,collections
root=Path('temp/wc-runs');data=Path.home()/'.local/share/stroke-gallery/data';vf=data/'review-votes.json';bf=data/'review-batches.json';vb=vf.read_bytes();bb=bf.read_bytes();votes=json.loads(vb);batches=json.loads(bb);cases={(b['id'],c['id']):(b,c)for b in batches for c in b['cases']};reports={}
for f in root.rglob('report.json'):
 raw=f.read_bytes();sha=hashlib.sha256(raw).hexdigest()
 if sha not in reports:
  try:r=json.loads(raw);reports[sha]={'path':str(f),'variant':r.get('variant'),'base':r.get('base'),'complete':r.get('complete')}
  except:pass
latest={};events=[]
for v in votes:
 k=(v['batch'],v['case']);assert k in cases;latest[k]=v
rows=[];groups={};missing=[]
for k,v in latest.items():
 b,c=cases[k];assert v.get('candidateId')==c['candidateId'];candReport=reports.get(c.get('candidateReportSha256'));baseReport=reports.get(c.get('baselineReportSha256'));base=c.get('baselineId');proof='batch explicit baselineId'
 if not base:
  base='baseline'if k[0]=='round1'else'UNKNOWN_EARLY_BASELINE';proof='round1 originalcontrol'if k[0]=='round1'else'unresolved; not assumed'
 if c.get('candidateReportSha256')and not candReport:missing.append({'batch':k[0],'case':k[1],'role':'candidate','sha':c['candidateReportSha256']})
 if c.get('baselineReportSha256')and not baseReport:missing.append({'batch':k[0],'case':k[1],'role':'baseline','sha':c['baselineReportSha256']})
 row={'batch':k[0],'case':k[1],'sheet':str(c['sheet']),'n':c['n'],'candidate':c['candidateId'],'baseline':base,'baseEngine':c.get('baseEngine',b.get('baseEngine')),'verdict':v['verdict'],'comment':v.get('comment',''),'inputSha256':c.get('inputSha256'),'candidateReport':candReport,'baselineReport':baseReport,'baselineIdentityProof':proof};rows.append(row);key=(row['candidate'],base,row['sheet'],row['baseEngine']);g=groups.setdefault(key,{'candidate':key[0],'baseline':key[1],'sheet':key[2],'baseEngine':key[3],'scope':0,'better':0,'worse':0,'uncertain':0,'skip':0,'cases':[]});g['scope']+=1;g[v['verdict']]+=1;g['cases'].append({'batch':k[0],'n':c['n'],'verdict':v['verdict'],'comment':v.get('comment','')})
out={'scope':'Read-only human pairwise votes; counts only, not statistical significance or globalranking. Baseline/candidate/source matter. Latest perbatchcase plus preservedeventcount.','voteEvents':len(votes),'latestCaseVotes':len(latest),'snapshot':{'votesSHA256':hashlib.sha256(vb).hexdigest(),'votesMtimeNs':vf.stat().st_mtime_ns,'batchesSHA256':hashlib.sha256(bb).hexdigest(),'batchesMtimeNs':bf.stat().st_mtime_ns},'byVariantParentSheet':sorted(groups.values(),key=lambda g:(int(g['sheet']),g['candidate'],g['baseline'])),'rows':rows,'reportHashMissing':missing,'reportCoverage':{'candidateMatched':sum(r['candidateReport']is not None for r in rows),'baselineMatched':sum(r['baselineReport']is not None for r in rows)},'nextInvestigations':[]};f=root/'overnight-next/human-vote-audit-current.json';f.write_text(json.dumps(out,indent=2,ensure_ascii=False));assert vf.read_bytes()==vb and bf.read_bytes()==bb
print('events/latest',len(votes),len(latest),'matched reports',out['reportCoverage'],'missing',len(missing));print('6/9 better:');print([(r['batch'],r['sheet'],r['n'],r['candidate'],r['baseline'])for r in rows if r['sheet']in['6','9']and r['verdict']=='better']);print('29:',[(r['sheet'],r['verdict'])for r in rows if r['batch']=='round29'])
