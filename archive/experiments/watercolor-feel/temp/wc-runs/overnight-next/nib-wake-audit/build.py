import json,pathlib,copy
r=pathlib.Path('temp/wc-runs/overnight-next'); parent=r/'calibrated-systematic-strength/production-calibrated-systematic251-coupling80-mixclock-v2.json'; base=json.loads(parent.read_text())
before='vx[i] = vx[i] * (1 - a) + d.dx / length * a;\n\t\t\tvy[i] = vy[i] * (1 - a) - d.dy / length * a;'
common='const kappa = Math.max(rx / ry, ry / rx);\n\t\t\tconst ux = d.dx / length, uy = d.dy / length;\n'
wake=common+'''\t\t\tconst bx = px * c + py * s, by = -px * s + py * c;
\t\t\tconst bux = ux * c + uy * s, buy = -ux * s + uy * c;
\t\t\tconst t = 1 - r2, psi0 = bux * by - buy * bx;
\t\t\tconst wx = bux * t * t - 4 * t * by * psi0 / (ry * ry);
\t\t\tconst wy = buy * t * t + 4 * t * bx * psi0 / (rx * rx);
\t\t\tconst localX = (wx * c - wy * s) / kappa, localY = (wx * s + wy * c) / kappa;
'''
control=common+'\t\t\tconst localX = ux / kappa, localY = uy / kappa;\n'
end='''\t\t\tconst localNorm = Math.hypot(localX, localY);
\t\t\tif (!Number.isFinite(localNorm) || localNorm > 1 + 1e-6) throw Error("Nib wake velocity bound failed: " + localNorm);
\t\t\tglobalThis.__wcNibWakeMaxNorm = Math.max(globalThis.__wcNibWakeMaxNorm || 0, localNorm);
\t\t\tglobalThis.__wcNibWakeSamples = (globalThis.__wcNibWakeSamples || 0) + 1;
\t\t\tvx[i] = vx[i] * (1 - a) + localX * a;
\t\t\tvy[i] = vy[i] * (1 - a) - localY * a;'''
for name,body in [('compact',wake),('aspect-damped-control',control)]:
 s=copy.deepcopy(base);s['id']='production-strong80-nib-wake-'+name;s['mechanism']='Compact translating-nib streamfunction local velocity' if name=='compact' else 'Matched uniform per-dab velocity divided by ellipse condition number';s['runtimePatches'].append(dict(kind='vite-module-exact',module='/src/engine/src/watercolor/brushDrag.ts',before=before,after=body+end,countPerResponse=1,semanticFamily='nib-wake-local-velocity-'+name));s['observableOutcome']='Only per-dab conditional velocity changes; exposure B, source MAX, source P/C and coverage, contact partitions and calibrated strong80 h/mixclock are unchanged.';s['risks']=['Analytic per-dab divergence-free property does not extend through EMA, B weighting, byte quantization or transport gates.','Ellipse condition-number division attenuates center speed; matched control isolates this confound.','This is a constitutive diagnostic, not established watercolor fluid physics.'];s['requiredRuntimeChecks']=['__wcNibWakeSamples > 0','__wcNibWakeMaxNorm <= 1+1e-6','Matched actual contact rect/count and B hashes; matched source P/C before brush.'];s['researchParentSpec']=str(parent);(r/'nib-wake-audit'/f"{s['id']}.json").write_text(json.dumps(s,indent=2))
