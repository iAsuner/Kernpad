import Cocoa
import WebKit

// Drives the real host in an isolated bundle, never shipped with the application.
final class PerformanceRunner {
 let host:AppDelegate, output:URL
 var evidence:[String:Any]=[:]
 var steps:[(String,String,Double,String)]=[]
 init(_ host:AppDelegate,_ output:URL){self.host=host;self.output=output}
 func fail(_ error:Error){try? Data(String(describing:error).utf8).write(to:output.appendingPathExtension("error"));exit(1)}
 func evaluate(_ script:String,_ done:@escaping(Any)->Void){
  host.web.callAsyncJavaScript("return await ("+script+");",arguments:[:],in:nil,in:.page){result in
   switch result{case .success(let value):done(value);case .failure(let error):self.fail(error)}
  }
 }
 func start(_ attempts:Int=0){
  guard attempts<200 else{exit(2)}
  guard host.web != nil,host.pageLoaded else{DispatchQueue.main.asyncAfter(deadline:.now()+0.1){self.start(attempts+1)};return}
  evaluate("Boolean(window.nativeApp?.ready())"){value in
   guard value as? Bool == true else{DispatchQueue.main.asyncAfter(deadline:.now()+0.1){self.start(attempts+1)};return}
   self.host.window.setContentSize(NSSize(width:1260,height:860))
   self.steps=[("startup","prepare()",5,"fixture"),("idle","",10,""),("open","open()",10,"canvas")]
   self.steps += (0..<20).map{($0==0 ? "editing":"","edit(\($0))",0.5,"")}
   self.steps += [("","",3,""),("preview","preview()",10,"preview"),("closed","close()",10,"")]
   for i in 0..<5 {self.steps += [(i==0 ? "repeat":"","preview()",0.5,""),("","close()",0.5,"")]}
   self.steps += [("settled","",10,""),("finish","finish()",0,"checks")]
   self.next()
  }
 }
 func next(){
  guard !steps.isEmpty else{
   do{try JSONSerialization.data(withJSONObject:evidence,options:.prettyPrinted).write(to:output.appendingPathExtension("checks.json"));try Data("done".utf8).write(to:output.appendingPathExtension("phase"),options:.atomic);exit(0)}catch{fail(error)};return
  }
  let (phase,script,delay,key)=steps.removeFirst()
  do{if !phase.isEmpty{try Data(phase.utf8).write(to:output.appendingPathExtension("phase"),options:.atomic)}}catch{fail(error);return}
  let done:(Any)->Void={value in
   if !key.isEmpty{self.evidence[key]=value}
   DispatchQueue.main.asyncAfter(deadline:.now()+delay){self.next()}
  }
  if script.isEmpty{done(true)}else{evaluate("window.__performanceWorkload."+script,done)}
 }
}
