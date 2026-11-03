"""Batch renderer, two independent CPU renders at once."""
from pathlib import Path
import concurrent.futures,subprocess,sys,json
P=Path(__file__).resolve().parent
kinds=list(json.loads((P/'connection_points.json').read_text()))
def run(kind):
 subprocess.run([sys.executable,str(P/'render_railway.py'),'--kind',kind,'--spp','128'],check=True)
 return kind
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
  for kind in ex.map(run,kinds):print('Finished',kind,flush=True)
