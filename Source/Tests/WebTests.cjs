const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const {webcrypto} = require('crypto');
const web = path.join(__dirname, '..', 'Web');
const source = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
const ctx = {URL, crypto:webcrypto, structuredClone};
vm.createContext(ctx);
const run = text => vm.runInContext(text, ctx);
const section = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
run(section('const types=', 'const appearance='));
run(section('function parsePattern(', 'const demoSeed='));
run(`const fieldKinds=[];function specField(key){return {key,label:key,kind:'text'};}`);
run(source.match(/^function safeURL.*$/m)[0]);
run(section('const fieldDef=', '// Bring the demo records'));
run(section('function base32Decode(', 'let otpStep='));
const localization=fs.readFileSync(path.join(web,'i18n.js'),'utf8');
run(localization.slice(0,localization.indexOf('const translatedText=')));
run('locale="en";');
run(fs.readFileSync(path.join(web,'layout-model.js'),'utf8'));
const native=fs.readFileSync(path.join(web,'native.js'),'utf8');
run(native.slice(native.indexOf('function isProtected('),native.indexOf('function snapshot(')));
let count=0;
const check=(name,body)=>{try{body();count++;}catch(e){throw new Error(name+': '+e.message);}};
check('20 template families',()=>assert.equal(run('allTemplates().length'),20));
for(const id of run('Object.keys(templateRegistry)')){
 check(id+' has complete fields and no sample passwords',()=>{
  const result=run(`(()=>{const t=getTemplate(${JSON.stringify(id)}),r=schemaNativeBase(t);return {actual:r.fields.length,expected:t.fields.filter(f=>!f.key.startsWith('email.')).length,secret:r.fields.filter(f=>f.secret&&f.value).length,otp:r.totp,valid:parsePattern(t.pattern).keys.every(k=>t.fields.some(f=>f.key===k))};})()`);
  assert.equal(result.actual,result.expected);assert.equal(result.secret,0);assert.equal(result.otp,false);assert.equal(result.valid,true);
 });
}
check('quoted delimiter',()=>assert.equal(ctx.parseLine('alice|"a|b"','|')[1],'a|b'));
check('quoted quote',()=>assert.equal(ctx.parseLine('alice|"a""b"','|')[1],'a"b'));
check('literal delimiter',()=>assert.equal(ctx.parseLine('alice.*secret','.*')[1],'secret'));
check('reserved properties rejected',()=>assert.throws(()=>ctx.parsePattern('{$__proto__.polluted}')));
check('column counts checked',()=>assert.ok(ctx.parseBatch('{$account}|{$password}','alice').rows[0].error));
check('bad links rejected',()=>assert.ok(ctx.parseBatch('{$url}','javascript:alert(1)',[{key:'url',kind:'url'}]).rows[0].error));
check('auth code is not seed',()=>assert.ok(ctx.parseBatch('{$totp.secret}','123456',[{key:'totp.secret',kind:'otp'}]).rows[0].error));
check('note public by default',()=>assert.equal(ctx.isProtected({type:'note'}),false));
check('secret property requires vault',()=>assert.equal(ctx.isProtected({type:'note',fields:[{secret:true}]}),true));
check('OTP block requires vault',()=>assert.equal(ctx.isProtected({type:'note',blocks:[{type:'otp'}]}),true));
check('an explicitly public note authenticator stays public',()=>assert.equal(ctx.isProtected({type:'note',blocks:[{type:'otp',storage:'public'}]}),false));
check('a public flag never exposes an already protected note',()=>assert.equal(ctx.isProtected({type:'note',protected:true,blocks:[{type:'otp',storage:'public'}]}),true));
check('form block requires vault',()=>assert.equal(ctx.isProtected({type:'note',blocks:[{type:'form'}]}),true));
check('stored legacy seed requires vault',()=>assert.equal(ctx.isProtected({type:'note',otpSecret:'test'}),true));
check('version label English',()=>assert.equal(ctx.tr('1.0.0 本地个人版'),'1.0.0 Local personal edition'));
check('Windows system-authentication wording is English',()=>{run("globalThis.kernpadPlatform='windows'");assert.equal(ctx.tr('重试 Touch ID'),'Try Windows Hello again');});
check('Windows system-authentication wording is Chinese',()=>{run('locale="zh"');assert.equal(ctx.tr('使用 Touch ID 或 Mac 登录密码查看此密码库。'),'使用 Windows Hello 或 Windows Hello PIN查看此密码库。');run('locale="en"');});
check('macOS retains native authentication wording',()=>{run('delete globalThis.kernpadPlatform');assert.equal(ctx.tr('重试 Touch ID'),'Try Touch ID again');});
check('Chinese restores original labels',()=>{run('locale="zh"');assert.equal(ctx.tr('切换语言'),'切换语言');run('locale="en"');});
check('literal pipe example translates intact',()=>assert.match(ctx.tr('例：{$account}|{$password}。使用相同分隔符；email.account / email.password 用于关联邮箱。保存后进入粘贴录入。'),/^Example: \{\$account\}\|\{\$password\}/));
const labels=run(`allTemplates().flatMap(t=>[t.name,...t.fields.flatMap(f=>[f.label,f.section||'',f.shortcut||'']),...t.blocks.map(b=>b.text||'')])`);
const missing=[...new Set(labels.filter(t=>/[\u4e00-\u9fff]/.test(ctx.tr(t))))];
if(missing.length)console.log('Missing English template labels:',JSON.stringify(missing));
const model=run(`({records:allTemplates().map(t=>schemaNativeBase(t)),templates:{builtin:templateRegistry,custom:{}}})`);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(model));
(async()=>{
 const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 for(const [seconds,expected]of [[59,'287082'],[1111111109,'081804'],[1234567890,'005924'],[2000000000,'279037']]){
  const code=await ctx.codeFromSeed(seed,Math.floor(seconds/30));check('RFC 6238 '+seconds,()=>assert.equal(code,expected));
 }
 console.log(`${count} template / parser / TOTP / locale / privacy checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
