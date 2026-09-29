// Regression: unavailable map resources must not prevent the itinerary from rendering.
// Run: node tests/map-loading.mjs (set CHROME_PATH if Chrome is not in its usual location).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const chrome=process.env.CHROME_PATH||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].find(existsSync);
if(!chrome)throw new Error('Set CHROME_PATH to an installed Chrome/Chromium executable.');
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const path=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
    if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[extname(path)]||'text/plain';
    const content=await readFile(path);
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'}).end(content);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp(resolve(tmpdir(),'travel-map-test-'));
const browser=spawn(chrome,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let startupError=null;browser.on('error',e=>{startupError=e;});
try{
  let endpoint;
  for(let i=0;i<100;i++){
    if(startupError)throw startupError;
    try{const [port,path]=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);endpoint=`ws://127.0.0.1:${port}${path}`;break;}catch{await delay(100);}
  }
  assert.ok(endpoint,'Chrome debugger starts');
  socket=new WebSocket(endpoint);
  await new Promise((ok,no)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',no,{once:true});});
  let seq=0,sessionId,assetMode='allow';
  const pending=new Map(),errors=[],held=[],requests=[];
  function call(method,params={},session){
    return new Promise((ok,no)=>{
      const id=++seq,timer=setTimeout(()=>{pending.delete(id);no(new Error('CDP timeout: '+method));},18000);
      pending.set(id,{ok,no,timer});socket.send(JSON.stringify({id,method,params,sessionId:session}));
    });
  }
  const page=(method,params)=>call(method,params,sessionId);
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.no(new Error(m.error.message)):p.ok(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;requests.push(request.url);
      if(request.url.includes('cdn.jsdelivr.net')||assetMode==='stall'){held.push(requestId);return;}
      const fail=assetMode==='fail'||request.url.includes('router.project-osrm.org');
      page(fail?'Fetch.failRequest':'Fetch.continueRequest',fail?{requestId,errorReason:'Failed'}:{requestId}).catch(e=>errors.push(e.message));
    }
  });
  const target=await call('Target.createTarget',{url:'about:blank'});
  sessionId=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  async function evaluate(expression){const r=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
  async function until(expression,label,timeout=6000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await delay(100);}throw new Error('Timed out: '+label);}
  await page('Runtime.enable');await page('Page.enable');await page('Network.enable');
  await page('Network.setCacheDisabled',{cacheDisabled:true});
  await page('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await page('Fetch.enable',{patterns:['*cdn.jsdelivr.net/*','*/assets/vendor/leaflet/*','*router.project-osrm.org/*'].map(urlPattern=>({urlPattern,requestStage:'Request'}))});
  await page('Page.navigate',{url:base+'/index.html'});
  await until(`document.getElementById('editBtn')?.dataset.coreBound==='1'`,'itinerary initializes with CDN unavailable');
  assert.equal(await evaluate(`document.querySelectorAll('.day').length`),5);
  assert.equal(await evaluate(`document.querySelector('h1').getBoundingClientRect().height>0`),true);
  assert.equal(requests.length,0,'Initial UI makes no map/CDN requests');
  console.log('PASS: initial mobile UI works with all CDN requests stalled');

  assetMode='fail';
  await evaluate(`document.querySelector('[data-tab="map"]').click()`);
  await until(`document.getElementById('mapStatus').textContent.includes('失败')`,'map failure is isolated');
  await evaluate(`document.querySelector('[data-tab="costs"]').click();document.querySelector('[data-id="fuel"] .cost-input').value=100;calcCosts();`);
  assert.equal(await evaluate(`document.getElementById('grandTotal').textContent`),'¥100');
  console.log('PASS: failed map assets do not break cost controls');

  assetMode='stall';
  await evaluate(`document.querySelector('[data-tab="map"]').click();document.querySelector('[data-tab="hotels"]').click();`);
  assert.equal(await evaluate(`document.querySelector('.section.active').id`),'hotels');
  await until(`document.getElementById('mapStatus').textContent.includes('超时')`,'stalled map request times out',14000);
  for(const requestId of held.splice(0))await page('Fetch.failRequest',{requestId,errorReason:'Aborted'});
  console.log('PASS: stalled map times out while the hotel tab remains usable');

  assetMode='allow';
  await evaluate(`document.querySelector('[data-tab="map"]').click()`);
  await until(`tripMapReady&&Object.keys(mapRouteLayers).length===5`,'retry loads local map and five fallback routes');
  assert.equal(await evaluate(`document.querySelectorAll('.leaflet-container').length`),1);
  assert.equal(requests.some(url=>url.includes('cdn.jsdelivr.net')),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: retry restores the local map; no JavaScript errors');
  await call('Browser.close');
}finally{
  socket?.close();browser.kill();server.close();
}
