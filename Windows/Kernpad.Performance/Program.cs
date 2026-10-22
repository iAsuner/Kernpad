using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using Kernpad.Core;
using Kernpad.Windows;

static class Program {
    static string phase="startup";
    sealed record Sample(double At,string Phase,long PrivateBytes,long WorkingSetBytes,double CpuDeltaMs,int[] Pids);
    [STAThread] static int Main(string[] args) {
        if(args.Length!=1)throw new ArgumentException("Specify an output JSON path");
        var output=Path.GetFullPath(args[0]);Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        var prior=Process.GetProcessesByName("msedgewebview2").Select(p=>p.Id).ToHashSet();
        var root=Path.Combine(Path.GetTempPath(),"Kernpad-Performance-"+Guid.NewGuid());
        using var store=new VaultStore(root);
        var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};var window=new MainWindow(store,true);
        var samples=new List<Sample>();var stop=new CancellationTokenSource();var watch=Stopwatch.StartNew();var exit=1;
        var sampling=Task.Run(async()=>{
            var last=new Dictionary<int,double>();
            while(!stop.IsCancellationRequested){
                long memory=0,resident=0;double cpu=0;var ids=new List<int>();
                var processes=Process.GetProcessesByName("msedgewebview2").Where(p=>!prior.Contains(p.Id)).Append(Process.GetCurrentProcess());
                foreach(var p in processes)using(p){try{
                    p.Refresh();var now=p.TotalProcessorTime.TotalMilliseconds;
                    if(last.TryGetValue(p.Id,out var previous))cpu+=Math.Max(0,now-previous);
                    last[p.Id]=now;memory+=p.PrivateMemorySize64;resident+=p.WorkingSet64;ids.Add(p.Id);
                }catch(InvalidOperationException){}catch(System.ComponentModel.Win32Exception){}}
                samples.Add(new(watch.Elapsed.TotalSeconds,phase,memory,resident,cpu,ids.ToArray()));
                await Task.Delay(200);
            }
        });
        app.Startup+=async(_,_)=>{
            try{
                await window.Ready.Task.WaitAsync(TimeSpan.FromSeconds(45));
                for(var i=0;i<200;i++){if((await window.EvaluateAwaited("Boolean(window.nativeApp?.ready())"))?.GetValue<bool>()==true)break;await Task.Delay(100);}
                window.Width=1260;window.Height=860;
                var fixture=await window.EvaluateAwaited("window.__performanceWorkload.prepare()");
                await Task.Delay(5000);phase="idle";await Task.Delay(10000);
                phase="open";var canvas=await window.EvaluateAwaited("window.__performanceWorkload.open()");await Task.Delay(10000);
                phase="editing";for(var i=0;i<20;i++){await window.EvaluateAwaited($"window.__performanceWorkload.edit({i})");await Task.Delay(500);}await Task.Delay(3000);
                phase="preview";var preview=await window.EvaluateAwaited("window.__performanceWorkload.preview()");await Task.Delay(10000);
                phase="closed";await window.EvaluateAwaited("window.__performanceWorkload.close()");await Task.Delay(10000);
                phase="repeat";for(var i=0;i<5;i++){await window.EvaluateAwaited("window.__performanceWorkload.preview()");await Task.Delay(500);await window.EvaluateAwaited("window.__performanceWorkload.close()");await Task.Delay(500);}
                phase="settled";await Task.Delay(10000);
                var checks=await window.EvaluateAwaited("window.__performanceWorkload.finish()");
                stop.Cancel();await sampling;
                var phases=samples.Select((s,i)=>(s,i)).Where(x=>x.i>0&&x.s.Phase!="startup").GroupBy(x=>x.s.Phase).ToDictionary(g=>g.Key,g=>{
                    var seconds=g.Sum(x=>x.s.At-samples[x.i-1].At);
                    return new {seconds,private_mean_MB=g.Average(x=>x.s.PrivateBytes)/1e6,private_peak_MB=g.Max(x=>x.s.PrivateBytes)/1e6,resident_mean_MB=g.Average(x=>x.s.WorkingSetBytes)/1e6,resident_peak_MB=g.Max(x=>x.s.WorkingSetBytes)/1e6,cpu_percent_one_core=g.Sum(x=>x.s.CpuDeltaMs)/1000/seconds*100};
                });
                File.WriteAllText(output,JsonSerializer.Serialize(new{os=Environment.OSVersion.ToString(),architecture=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),cores=Environment.ProcessorCount,fixture,canvas,preview,checks,phases,samples},new JsonSerializerOptions{WriteIndented=true}));exit=0;
            }catch(Exception error){File.WriteAllText(output+".error",error.ToString());}
            finally{stop.Cancel();app.Shutdown(exit);}
        };
        window.Show();app.Run();return exit;
    }
}
