import json,sys,collections
p=sys.argv[1]; report=json.load(open(p)); result=report.get('result',{});g=result.get('passiveGL',{});print('pass',report.get('pass'),'closed',report.get('ownTargetClosed'),'GL',result.get('gl'),'lost',result.get('lost'));print('programs',len(g.get('programs',{})),'draws',g.get('draws'))
for gap in g.get('gaps',[]):
 r=gap['records'];print('gap',gap['t'],gap['dt'],'records',len(r),'phases',collections.Counter(x['phase'] for x in r));print('drawPrograms',collections.Counter(x['program'] for x in r if x['name'].startswith('draw')));print('calls',collections.Counter(x['name'] for x in r));print('lastDraws',[(x['t'],x['name'],x['program'],x['args']) for x in r if x['name'].startswith('draw')][-20:]);print('links',[x for x in r if x['name']=='linkProgram'])
