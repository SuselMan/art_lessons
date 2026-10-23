import sys,gzip,hashlib,json
from pathlib import Path
blob=bytes.fromhex(sys.stdin.read().strip());raw=gzip.decompress(blob)
assert len(raw)<=32*1024*1024
sha=hashlib.sha256(raw).hexdigest()
assert sha=='659734a7377881d6b715a4ccb23fa984d734428d6beb6c5ee4584ce7636b97b0'
p=Path('/home/suselman/projects/pencil-agents/680-lifetime-hardware/temp/gpu-fence-runtime/apps/web/own-snapshot728.bin');p.write_bytes(blob);p.chmod(0o600)
print(json.dumps({'room':'7uv_Zz9X','layer':'layer-1','seq':3,'compressed':len(blob),'raw':len(raw),'sha':sha}))
