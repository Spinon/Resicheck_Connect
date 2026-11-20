// One local-browser smoke. Existing Playwright only; no Auth, media or backend.
import fs from'node:fs/promises';import path from'node:path';import{createServer}from'node:http';import{createRequire}from'node:module';import{createHash}from'node:crypto';import assert from'node:assert/strict';
assert.equal(process.argv.length,3);assert.equal(process.argv[2],'--local-export-smoke');
const root=process.cwd(),source=JSON.parse(await fs.readFile('output/messaging33-builders/web-export-validation.json','utf8')),directory=path.resolve(source.directory),allowed=new Map(source.files.map(x=>['/'+x.path,x]));
const out=path.resolve('output/messaging33-browser-smoke',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(out,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH=path.resolve('tools/web-e2e/.browsers');delete process.env.DEBUG;delete process.env.PWDEBUG;
const{chromium}=createRequire(path.resolve('tools/web-e2e/package.json'))('playwright');
const report={state:'running-local-smoke',sourceFingerprint:source.sourceFingerprint,exportFingerprint:source.exportFingerprint,checks:[],screenshots:[],httpRequests:[],externalRequestsBlocked:0,pageErrors:[],consoleErrors:[],authAttempts:0,loginSubmitted:false,backendOrMediaTested:false,newAccounts:false,existingProfilesUsed:false,cleanup:{}};
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.txt':'text/plain;charset=utf-8'};
let base,browser,context,page;const safe=s=>String(s).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[jwt]').replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,'[key]').slice(0,450);
const server=createServer(async(req,res)=>{try{if(!base||req.headers.host!==new URL(base).host||!['GET','HEAD'].includes(req.method)){res.writeHead(403).end();return;}
 const url=new URL(req.url,base),name=url.pathname==='/'?'/index.html':url.pathname,item=allowed.get(name);
 if(!item||url.search){res.writeHead(404).end();return;}
 const bytes=await fs.readFile(path.join(directory,item.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
 res.setHeader('Content-Type',mime[path.extname(name)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');report.httpRequests.push({path:name,status:200,method:req.method});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(500).end();}});
const check=(name,v)=>{assert(v,name);report.checks.push(name);};
try{
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===base)return route.continue();report.externalRequestsBlocked++;return route.abort('blockedbyclient');});
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.pageErrors.push(safe(e.message)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('favicon.ico'))report.consoleErrors.push(safe(m.text()));});
 await page.goto(base,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
 check('login renders from real export',await page.getByText('Bom ter você aqui',{exact:true}).isVisible());
 check('empty fresh browser profile',await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
 check('password field masked',await page.getByLabel('Senha',{exact:true}).getAttribute('type')==='password');
 check('desktop no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 check('logo image loaded',await page.locator('img').evaluateAll(img=>img.length>0&&img.every(x=>x.complete&&x.naturalWidth>0)));
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByText('Preencha seu e-mail e sua senha.',{exact:true}).waitFor();check('blank submit stays local with actionable validation',await page.getByLabel('E-mail',{exact:true}).inputValue()===''&&await page.getByLabel('Senha',{exact:true}).inputValue()==='');
 await page.getByLabel('E-mail',{exact:true}).focus();await page.keyboard.press('Tab');check('keyboard focus reaches password',await page.getByLabel('Senha',{exact:true}).evaluate(e=>e===document.activeElement));
 await page.screenshot({path:path.join(out,'desktop.png')});report.screenshots.push('desktop.png');
 await page.setViewportSize({width:390,height:844});check('mobile login controls remain usable',await page.getByLabel('E-mail',{exact:true}).isVisible()&&await page.getByLabel('Senha',{exact:true}).isVisible()&&await page.getByRole('button',{name:'Entrar',exact:true}).isVisible());
 check('mobile no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'mobile.png')});report.screenshots.push('mobile.png');
 check('no external request or Auth call',report.externalRequestsBlocked===0);check('no browser runtime errors',report.pageErrors.length===0&&report.consoleErrors.length===0);
 report.state='passed-real-browser-local33-login-smoke-no-auth-or-backend';
}catch(e){report.state='failed-real-browser-local33-smoke';report.failure=safe(e.message);throw e;}finally{
 await context?.close();await browser?.close();report.cleanup.browserClosed=true;
 await new Promise(resolve=>server.close(resolve));report.cleanup.loopbackServerClosed=true;
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');await fs.mkdir('output/messaging33-browser-smoke',{recursive:true});await fs.writeFile('output/messaging33-browser-smoke/current.json',JSON.stringify({result:path.relative(root,path.join(out,'result.json')).replaceAll('\\','/'),out:path.relative(root,out).replaceAll('\\','/')},null,2)+'\n');console.log(JSON.stringify({state:report.state,checks:report.checks,externalRequestsBlocked:report.externalRequestsBlocked,pageErrors:report.pageErrors.length,consoleErrors:report.consoleErrors.length,result:path.relative(root,path.join(out,'result.json')).replaceAll('\\','/'),cleanup:report.cleanup}));
}
