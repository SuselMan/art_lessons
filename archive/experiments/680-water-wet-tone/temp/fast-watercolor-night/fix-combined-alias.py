from pathlib import Path
p=Path('/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/combined-87f/apps/web/vite.config.ts')
s=p.read_text();s=s.replace('  return {\n    build:', '  return {\n    resolve: { alias: { "@grafetto/shared": "/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/combined-87f/packages/shared/src/index.ts" } },\n    build:',1);p.write_text(s)
