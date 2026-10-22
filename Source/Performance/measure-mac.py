#!/usr/bin/env python3
"""Measure the isolated native host and its newly launched WebKit processes."""
import ctypes,json,time,sys,statistics,subprocess,tempfile
from pathlib import Path
project=Path(__file__).resolve().parents[2]
label=sys.argv[1];run=sys.argv[2] if len(sys.argv)>2 else '1'
output=project/'Build/performance'/('mac-'+label+'-'+run)
class Usage(ctypes.Structure):
 _fields_=[('uuid',ctypes.c_ubyte*16)]+[(name,ctypes.c_uint64) for name in ['user','system','idle','interrupts','pageins','wired','resident','footprint','start','exit','child_user','child_system','child_idle','child_interrupts','child_pageins','child_elapsed','read','written']]
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
class Timebase(ctypes.Structure):_fields_=[('numer',ctypes.c_uint32),('denom',ctypes.c_uint32)]
tb=Timebase();ctypes.CDLL('/usr/lib/libSystem.B.dylib').mach_timebase_info(ctypes.byref(tb));scale=tb.numer/tb.denom
def helpers():
 result={}
 for line in subprocess.check_output(['ps','-axo','pid=,comm='],text=True).splitlines():
  pid,name=line.strip().split(None,1)
  if '/com.apple.WebKit.' in name:result[int(pid)]=name.rsplit('/',1)[-1]
 return result
prior=helpers();known={};samples=[];last={};started=time.monotonic();last_discovery=0
for suffix in ['phase','error','checks.json']:output.with_suffix('.'+suffix).unlink(missing_ok=True)
store=tempfile.mkdtemp(prefix='Kernpad-Performance-')
with output.with_suffix('.log').open('w') as log:
 proc=subprocess.Popen([str(project/'Build/performance'/('Kernpad-'+label+'.app')/'Contents/MacOS/Kernpad'),'--test-store',store,'--performance-output',str(output)],stdout=log,stderr=log)
 known[proc.pid]='Kernpad'
 while proc.poll() is None:
  now=time.monotonic()
  if now-started>180:proc.terminate();raise RuntimeError('Benchmark timeout')
  if now-last_discovery>1:
   known.update({pid:name for pid,name in helpers().items() if pid not in prior});last_discovery=now
  phase=output.with_suffix('.phase').read_text() if output.with_suffix('.phase').exists() else 'startup'
  entries=[];cpu=0
  for pid,name in known.items():
   u=Usage()
   if lib.proc_pid_rusage(pid,2,ctypes.byref(u)):continue
   ns=(u.user+u.system)*scale
   if pid in last:cpu+=max(0,ns-last[pid])
   last[pid]=ns
   entries.append({'pid':pid,'name':name,'physical_bytes':u.footprint})
  samples.append({'at':now,'phase':phase,'cpu_delta_ns':cpu,'physical_bytes':sum(e['physical_bytes'] for e in entries),'processes':entries})
  time.sleep(.2)
 phases={}
 for phase in ['idle','open','editing','preview','closed','repeat','settled']:
  selected=[s for s in samples if s['phase']==phase]
  if not selected:continue
  seconds=sum(samples[i]['at']-samples[i-1]['at'] for i in range(1,len(samples)) if samples[i]['phase']==phase)
  phases[phase]={'seconds':seconds,'mean_MB':statistics.mean(s['physical_bytes'] for s in selected)/1e6,'peak_MB':max(s['physical_bytes'] for s in selected)/1e6,'cpu_percent_one_core':sum(s['cpu_delta_ns'] for s in selected)/1e9/seconds*100}
 report={'label':label,'run':run,'exit':proc.returncode,'processes':known,'timebase':[tb.numer,tb.denom],'phases':phases,'samples':samples}
 output.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='samples'},indent=2))
 if proc.returncode:raise SystemExit(proc.returncode)
