import pathlib,json,shutil,hashlib,os
r=pathlib.Path('temp/wc-runs/overnight-next');dest=r/'public44';tmp=r/'public44-staging';assert not dest.exists() and not tmp.exists();tmp.mkdir();base='production-max-paired-headroom2-microcoupled-curvature10';candidate='production-common18-general-int-power05-flow-pad4';ids=['s9-n3','s7-n3','s8-n1'];source=r/'inputs.json';inputs=json.loads(source.read_text());inputs['cases']=[next(c for c in inputs['cases'] if c['id']==i) for i in ids];(tmp/'inputs.json').write_text(json.dumps(inputs,indent=2)+'\n');shutil.copyfile(source,tmp/'original-full-inputs.json');proof=[]
for variant in [base,candidate]:
 folder=tmp/variant;folder.mkdir();(folder/'reports').mkdir();mapping={}
 for cid in ids:
  if variant==base:
   original=r/'physical22-comparison-baseline';ix=json.loads((original/'report-index.json').read_text())['cases'];report=original/ix[cid];png=original/(cid+'.png');name=pathlib.Path(ix[cid]).name
  else:
   original=r/('general-integer-power05-pad4-controls' if cid=='s8-n1' else 'general-integer-power05-pad4-seven-nine');report=original/'report.json';png=original/(cid+'.png');name='controls.json' if cid=='s8-n1' else 'seven-nine.json'
  data=json.loads(report.read_text());row=next(c for c in data['cases'] if c['id']==cid);sha=hashlib.sha256(png.read_bytes()).hexdigest();assert data['variant']==variant and data['base']==inputs['base'] and data['complete'] and not data.get('errors');assert row['pngSha256']==sha and not row.get('lost') and not row.get('error')
  shutil.copyfile(report,folder/'reports'/name);shutil.copyfile(png,folder/(cid+'.png'));mapping[cid]='reports/'+name;proof.append({'case':cid,'variant':variant,'originalReport':str(report),'reportSHA256':hashlib.sha256(report.read_bytes()).hexdigest(),'PNGsha256':sha})
 (folder/'report-index.json').write_text(json.dumps({'cases':mapping},indent=2)+'\n')
config={'baseline':base,'description':'Перенос краски в двух сложных мазках и контроль на другом штрихе. Фото — ориентир; можно выбрать «не могу определиться».','comparisons':[{'case':i,'candidate':candidate} for i in ids]};(tmp/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2)+'\n');(tmp/'staging-proof.json').write_text(json.dumps({'cases':3,'source':inputs['base'],'originalFullInputsSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'copies':proof,'publication':'NOT published; awaiting root'},indent=2)+'\n');os.rename(tmp,dest);print('staged44 cases3 reportsoriginalimmutable PNG6 SHA verified')
