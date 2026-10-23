import pathlib,json
n=pathlib.Path('temp/wc-runs/overnight-next');a=n/'nib-wake-compact57-four';b=n/'nib-wake-control57-four';da=json.loads((a/'report.json').read_text());db=json.loads((b/'report.json').read_text());out={}
for c in da['cases']:
 z=next(x for x in db['cases']if x['id']==c['id']);sameB=c['wakeAudit']['contactBHashes']==z['wakeAudit']['contactBHashes'];ha=[(x['settleNo'],x['pulses'],x['pulseGain'],x['contactMix'],x['S'],x['flowWidth'],x['flowHeight'],x['maxFlowBCode'],x['scissor'])for x in c['calibratedContactAudit']];hb=[(x['settleNo'],x['pulses'],x['pulseGain'],x['contactMix'],x['S'],x['flowWidth'],x['flowHeight'],x['maxFlowBCode'],x['scissor'])for x in z['calibratedContactAudit']];assert sameB and ha==hb
 out[c['id']]={'contactBAndGeometryExact':sameB,'allHopGainMixScissorExact':ha==hb,'wakeNormMax':c['wakeAudit']['maxNorm'],'controlNormMax':z['wakeAudit']['maxNorm'],'samplesWake':c['wakeAudit']['samples'],'samplesControl':z['wakeAudit']['samples'],'pngIdentity':(a/(c['id']+'.png')).read_bytes()==(b/(c['id']+'.png')).read_bytes()}
(n/'nib-wake-audit/matched-pair-qc.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out,indent=2))
