import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = await mkdtemp(resolve(tmpdir(), 'guangdong-feature-test-'));
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if(!chrome)throw new Error('Set CHROME_PATH to Chrome/Chromium.');
await mkdir(artifacts, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(resolve(root) + sep)) { res.writeHead(403).end(); return; }
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.md': 'text/plain', '.png': 'image/png' }[extname(path)] || 'application/octet-stream';
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = `${artifacts}/chrome-profile-${Date.now()}`;
const browser = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--disable-gpu',
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-extensions', 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Browser startup timeout: ' + stderr.slice(-1200))), 20000);
    browser.stderr.on('data', data => {
      stderr += data;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    const poll = setInterval(async () => {
      try {
        const [port, path] = (await readFile(profile + '/DevToolsActivePort', 'utf8')).trim().split(/\r?\n/);
        clearInterval(poll); clearTimeout(timer); resolve(`ws://127.0.0.1:${port}${path}`);
      } catch {}
    }, 200);
    poll.unref();
    browser.once('exit', code => { if (code !== 0) { clearInterval(poll); clearTimeout(timer); reject(new Error('Browser exited: ' + code + '; ' + stderr)); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let next = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.id && pending.has(message.id)) {
      const [resolve, reject, timer] = pending.get(message.id);
      clearTimeout(timer); pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  });
  function call(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, [resolve, reject, timer]);
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => call(method, params, sessionId);
  async function evaluate(expression) {
    const result = await page('Runtime.evaluate', { expression: 'eval(' + JSON.stringify(expression) + ')', returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await page('Runtime.enable'); await page('Page.enable');
  await page('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const checks=[];
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(expression,label){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}throw new Error('Timed out: '+label);}
  await page('Page.addScriptToEvaluateOnNewDocument',{source:`window.testAlerts=[];window.alert=m=>testAlerts.push(m);window.confirm=()=>true;`});
  await page('Page.navigate',{url:base+'/index.html'});
  await until(`!!document.getElementById('editBtn')?.dataset.coreBound && typeof costState!=='undefined'`,'app ready');
  await evaluate('refreshPhotos()');
  const content=await evaluate(`({days:document.querySelectorAll('.day').length,tabs:document.querySelectorAll('.tab').length,dates:[...document.querySelectorAll('.day')].map(x=>x.dataset.date),checks:document.querySelectorAll('.check input').length,nights:[...document.querySelectorAll('[data-category="hotel"] .qty-input')].reduce((a,x)=>a+Number(x.value),0),photoDays:Object.keys(PHOTO_DAY_META).length,dayOptions:document.getElementById('photoUploadDay').options.length,oldText:/青甘|广西|德天|通灵|靖西|玉林|青海湖|兰州|敦煌|茶卡|莫高窟/.test(document.body.textContent)})`);
  assert.deepEqual(content,{days:5,tabs:8,dates:Array.from({length:5},(_,i)=>'2026-10-0'+(i+1)),checks:10,nights:4,photoDays:5,dayOptions:5,oldText:false});
  checks.push('5 days, 8 original tabs, 4 hotel nights, no previous-trip content');
  const tabIds=['days','map','photos','transport','hotels','todo','costs','tips'];
  for(const tab of tabIds){
    if(tab==='map')continue;
    assert.equal(await evaluate(`document.querySelector('[data-tab="${tab}"]').click();document.querySelector('.section.active').id`),tab);
  }
  await evaluate(`document.querySelector('[data-tab="days"]').click();window.confirm=()=>true;document.getElementById('editBtn').click();`);
  assert.equal(await evaluate(`document.body.classList.contains('editing')`),true);
  await evaluate(`document.querySelector('.day .time').click()`);
  await delay(100);
  assert.equal(await evaluate(`document.getElementById('timePickerOverlay').classList.contains('open')`),true);
  await evaluate(`hourWheel.scrollTop=8*44;minuteWheel.scrollTop=15*44;document.getElementById('timePickerConfirm').click();`);
  assert.equal(await evaluate(`document.querySelector('.day .time').textContent`),'08:15');
  await evaluate(`const h=document.querySelector('.day h2');h.textContent='深圳 → 珠海御温泉 · 测试编辑';h.dispatchEvent(new Event('input'));document.querySelector('.day .add-item').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('.day:first-of-type .timeline .item').length`),6);
  await evaluate(`document.querySelector('.day .timeline .item:last-child .up').click()`);
  assert.equal(await evaluate(`document.querySelector('.day .timeline .item:nth-last-child(2) .desc').textContent.includes('新增安排')`),true);
  await evaluate(`document.querySelector('.day .timeline .item:nth-last-child(2) .down').click();document.querySelector('.day .timeline .item:last-child .del').click();document.getElementById('editBtn').click();`);
  assert.equal(await evaluate(`document.querySelectorAll('.day:first-of-type .timeline .item').length`),5);
  checks.push('timeline time wheel, inline editing, add, move up/down, delete');
  await evaluate(`document.querySelector('[data-tab="costs"]').click();const fuel=document.querySelector('[data-id="fuel"] .cost-input');fuel.value=1500;fuel.dispatchEvent(new Event('input',{bubbles:true}));const hotel=document.querySelector('[data-id="hotel-2"] .cost-input');hotel.value=500;hotel.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-add-category="other"]').click();const row=document.querySelector('[data-custom="1"]');row.querySelector('.custom-name').value='测试停车';row.querySelector('.cost-input').value=25;row.querySelector('.qty-input').value=2;row.querySelector('.cost-input').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.equal(await evaluate(`document.getElementById('grandTotal').textContent`),'¥2,050');
  assert.equal(await evaluate(`document.getElementById('budgetRemain').textContent`),'未设上限');
  await evaluate(`document.getElementById('budgetInput').value=2000;document.getElementById('budgetInput').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate(`document.getElementById('budgetRemain').textContent`),'超支 ¥50');
  await evaluate(`document.querySelector('[data-custom="1"] .cost-delete').click();document.getElementById('budgetInput').value=0;document.getElementById('budgetInput').dispatchEvent(new Event('input'));document.getElementById('c1').click();document.querySelector('button[data-font-size="large"]').click();applyDayViewFilter('d3');localStorage.setItem('guangxi_2026_trip_edits_v3',JSON.stringify({sentinel:'keep original'}));localStorage.setItem('guangxi_2026_c1','0');`);
  checks.push('cost totals, custom items, one hotel night, optional budget / overspend');
  await page('Page.reload');
  await until(`document.querySelector('.day h2')?.textContent.includes('测试编辑')`,'saved edit');
  assert.equal(await evaluate(`document.querySelector('.day .time').textContent`),'08:15');
  assert.equal(await evaluate(`document.getElementById('grandTotal').textContent`),'¥2,000');
  assert.equal(await evaluate(`document.getElementById('c1').checked`),true);
  assert.equal(await evaluate(`document.querySelector('button[data-font-size="large"]').getAttribute('aria-pressed')`),'true');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.day')].filter(d=>d.style.display!=='none').map(x=>x.dataset.date)`),['2026-10-03']);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('guangxi_2026_trip_edits_v3')).sentinel`),'keep original');
  assert.equal(await evaluate(`localStorage.getItem('guangxi_2026_c1')`),'0');
  await evaluate("localStorage.setItem('qinggan_trip_edits_v3',JSON.stringify({sentinel:'keep qinggan'}));saveState();saveCosts();");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('qinggan_trip_edits_v3')).sentinel"),'keep qinggan');
  checks.push('edits, costs, checklist, font, day filter persist; Guangxi and Qinggan storage untouched');
  // Real photo compression, IndexedDB, scenery/meal grouping and ordering.
  await evaluate(`(async()=>{const c=document.createElement('canvas');c.width=12;c.height=12;c.getContext('2d').fillRect(0,0,12,12);const b=await new Promise(r=>c.toBlob(r,'image/png'));window.testPhotoBlob=b;const f=new File([b],'sample.png',{type:'image/png'});await importPhotoFiles([f,f],'d3','scenery','dinner','白江湖瀑布测试');await importPhotoFiles([f],'d4','food','lunch','');document.querySelector('[data-tab="photos"]').click();})()`);
  assert.equal(await evaluate('photoRecords.length'),3);
  assert.equal(await evaluate(`photoRecords.filter(x=>x.day==='d3'&&x.caption==='白江湖瀑布测试').length`),2);
  assert.equal(await evaluate(`document.getElementById('photoGallery').textContent.includes('午餐')`),true);
  const sortedId=await evaluate(`(async()=>{const g=[...document.querySelectorAll('#photoGallery [data-sortable-grid="1"]')].find(x=>x.querySelectorAll('.sortable-photo').length===2);const first=g.firstElementChild;g.appendChild(first);const expected=g.firstElementChild.dataset.photoId;await persistPhotoGridOrder(g);return expected;})()`);
  assert.equal(await evaluate(`sortedPhotos(photoRecords.filter(x=>x.day==='d3'))[0].id`),sortedId);
  await evaluate(`openPhoto(${JSON.stringify(sortedId)});document.getElementById('photoCaptionInput').value='更新后的瀑布备注';saveCurrentPhotoCaption()`);
  assert.equal(await evaluate(`photoRecordById(${JSON.stringify(sortedId)}).caption`),'更新后的瀑布备注');
  assert.equal(await evaluate(`document.getElementById('photoLightbox').classList.contains('open')`),true);
  await evaluate(`stepPhoto(1);stepPhoto(-1);closePhotoLightbox();saveCommentProfile('旅伴','#bd6d3a');const details=document.querySelector('[data-comment-day="d3"]');details.querySelector('textarea').value='期待白江湖瀑布';submitComment('day','d3',details);`);
  await until(`commentRecords.length===1`,'comment saved');
  assert.equal(await evaluate(`localCommentGetAll()[0].body`),'期待白江湖瀑布');
  await evaluate(`openPhoto(${JSON.stringify(sortedId)});const details=document.getElementById('photoCommentDetails');details.querySelector('textarea').value='照片评论测试';submitComment('photo',details.dataset.commentPhoto,details);`);
  await until(`commentRecords.length===2`,'photo comment');
  await evaluate(`closePhotoLightbox();commentRecords.push({id:'remote-test',targetType:'day',targetId:'d5',author:'同伴',authorColor:'#4f7d72',body:'返程注意休息',createdAt:Date.now()});localCommentSaveAll();renderAllComments();`);
  assert.equal(await evaluate(`unreadComments().length`),1);
  await evaluate(`document.getElementById('commentUnreadOpenBtn').click()`);
  assert.equal(await evaluate(`unreadComments().length`),0);
  checks.push('photo compression/upload, IndexedDB, scenery/food galleries, reorder, lightbox, captions, day/photo comments and unread navigation');
  // Capture downloaded JSON to inspect and reimport it through the real UI.
  await evaluate(`window.testDownloads=[];HTMLAnchorElement.prototype.click=function(){if(this.download)testDownloads.push({name:this.download,promise:fetch(this.href).then(x=>x.json())});};document.getElementById('exportBtn').click();`);
  const exported=await evaluate(`testDownloads[0].promise`);
  assert.equal(exported.type,'guangdong_2026-trip-edits');
  assert.equal(exported.checks.c1,true);
  await evaluate(`exportPhotoBackup()`);
  const photoExport=await evaluate(`testDownloads[1].promise`);
  assert.equal(photoExport.type,'guangdong_2026-trip-photo-backup');
  assert.equal(photoExport.records.length,3);
  await evaluate(`exportFullLocalBackup()`);
  assert.equal(await evaluate(`testDownloads[2].promise.then(x=>x.type)`),'guangdong_2026-trip-full-backup');
  await evaluate(`openPhoto(${JSON.stringify(sortedId)});deleteCurrentPhoto()`);
  assert.equal(await evaluate('photoRecords.length'),2);
  await evaluate(`closePhotoLightbox();importPhotoBackupFile(new File([JSON.stringify(${JSON.stringify(photoExport)})],'photos.json',{type:'application/json'}))`);
  assert.equal(await evaluate('photoRecords.length'),3);
  await evaluate(`importPhotoBackupFile(new File([JSON.stringify({type:'guangxi_2026-trip-photo-backup',records:[]})],'wrong.json'))`);
  assert.equal(await evaluate(`testAlerts.at(-1).includes('导入失败')`),true);
  await evaluate(`const dt=new DataTransfer();dt.items.add(new File([JSON.stringify({type:'guangxi_2026-trip-edits',editState:{}})],'wrong.json'));document.getElementById('importFile').files=dt.files;document.getElementById('importFile').dispatchEvent(new Event('change'));`);
  await until(`testAlerts.at(-1)?.startsWith('导入失败')`,'reject old edits');
  exported.editState.fields.f0='深圳 → 珠海御温泉 · 导入验证';
  await evaluate(`const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(${JSON.stringify(exported)})],'edits.json'));document.getElementById('importFile').files=dt.files;document.getElementById('importFile').dispatchEvent(new Event('change'));`);
  await until(`document.querySelector('.day h2')?.textContent.includes('导入验证')`,'import reload');
  await evaluate('Promise.all([refreshPhotos(),refreshComments()])');
  assert.equal(await evaluate('photoRecords.length'),3);
  assert.equal(await evaluate(`localCommentGetAll().length`),3);
  checks.push('edit/photo/full JSON exports, edit/photo restore, old-trip backup rejection, photo/comment persistence');
  // All navigation links point to named destinations, never guessed hotel coordinates.
  await evaluate('refreshDynamicNavTargets()');
  assert.equal(await evaluate(`[...document.querySelectorAll('.nav')].every(x=>x.href.startsWith('https://uri.amap.com/search?')&&!!new URL(x.href).searchParams.get('keyword'))`),true);
  assert.equal(await evaluate(`new URL(document.querySelector('[data-nav-key="d3-baijiang"]').href).searchParams.get('keyword')`),'广州市增城区白江湖森林公园');
  assert.equal(await evaluate(`(async()=>{const d=document.querySelector('.desc[data-nav-stop="baijiang"]');d.firstChild.textContent='广州市增城区白水寨风景名胜区';await refreshDynamicNavTargets(true);const keyword=new URL(document.querySelector('[data-nav-key="d3-baijiang"]').href).searchParams.get('keyword');d.firstChild.textContent='广州市增城区白江湖森林公园';await refreshDynamicNavTargets(true);return keyword;})()`),'广州市增城区白水寨风景名胜区');
  checks.push('Amap search destinations / visitor center entrance');
  // Use the real Leaflet component; force a road-service failure to verify fallback deterministically.
  await evaluate('loadTripMapAssets()');
  assert.equal(await evaluate(`typeof L`),'object','Bundled Leaflet must load for map verification');
  await evaluate(`window.originalFetch=window.fetch;window.fetch=(url,...args)=>String(url).includes('router.project-osrm.org')?Promise.reject(new Error('simulated route outage')):originalFetch(url,...args);document.querySelector('[data-tab="map"]').click();`);
  await until(`Object.keys(mapRouteLayers).length===5`,'5 fallback routes');
  for(let day=1;day<=5;day++){
    const state=await evaluate(`applyMapDayFilter('d${day}',false);({routes:Object.entries(mapRouteLayers).filter(([id,l])=>tripMap.hasLayer(l)).map(([id])=>id),markers:mapMarkerLayers.filter(x=>tripMap.hasLayer(x.layer)).map(x=>x.codes.some(c=>c.startsWith('${day}.')))})`);
    assert.deepEqual(state.routes,['d'+day]);assert.equal(state.markers.every(Boolean),true);
  }
  await evaluate(`applyMapDayFilter('all',false);window.fetch=originalFetch;`);
  checks.push('real Leaflet map, 5 daily route filters, road outage fallback');
  // Contract verification with a fake Supabase client; no live account/database is touched.
  const cloudCalls=await evaluate(`(async()=>{window.testCloudCalls=[];const old={cloudReady,cloudClient,cloudUser};const result={data:[],error:null};const query=new Proxy({}, {get:(t,key)=>key==='then'?r=>r(result):(...args)=>{testCloudCalls.push([key,...args]);return query;}});cloudClient={from:name=>{testCloudCalls.push(['table',name]);return query;},storage:{from:name=>{testCloudCalls.push(['bucket',name]);return {upload:async()=>result};}},channel:name=>{testCloudCalls.push(['channel',name]);const c={on:(kind,config)=>{testCloudCalls.push(['realtime',kind,config]);return c;},subscribe:()=>c};return c;},removeChannel:()=>{}};cloudReady=true;cloudUser={id:'test-user'};await fetchCloudState('manual');await cloudPushStateNow();await cloudPhotoGetAll();await cloudPhotoPut({id:'fixture',day:'d3',blob:window.testPhotoBlob||new Blob(['x'],{type:'image/jpeg'}),createdAt:Date.now()});await cloudCommentGetAll();setupCommentRealtime();teardownCommentRealtime();cloudReady=old.cloudReady;cloudClient=old.cloudClient;cloudUser=old.cloudUser;return testCloudCalls;})()`);
  assert.deepEqual([...new Set(cloudCalls.filter(c=>c[0]==='table').map(c=>c[1]))].sort(),['guangdong_trip_comments','guangdong_trip_photos','guangdong_trip_state']);
  assert.equal(cloudCalls.filter(c=>c[0]==='bucket').every(c=>c[1]==='guangdong-trip-photos'),true);
  assert.equal(cloudCalls.find(c=>c[0]==='realtime'&&c[1]==='postgres_changes')[2].table,'guangdong_trip_comments');
  checks.push('isolated cloud table/bucket/realtime contract (mock; live credentials not available)');
  await evaluate(`document.querySelector('[data-tab="days"]').click();applyDayViewFilter('all');document.querySelector('button[data-font-size="normal"]').click();scrollTo(0,0);`);
  for(const width of [320,390,1440]){
    await page('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
    for(const tab of tabIds){await evaluate(`document.querySelector('[data-tab="${tab}"]').click()`);assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false,`overflow: ${tab} ${width}px`);}
  }
  await evaluate(`document.querySelector('[data-tab="days"]').click();scrollTo(0,0);`);
  await writeFile(artifacts+'/guangdong-desktop.png',Buffer.from((await page('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await page('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await delay(250);
  await writeFile(artifacts+'/guangdong-mobile.png',Buffer.from((await page('Page.captureScreenshot',{format:'png'})).data,'base64'));
  checks.push('all 8 tabs fit 320/390/1440px; mobile and desktop screenshots');
  const localLinks=await evaluate(`[...document.querySelectorAll('a[href],link[href],script[src]')].map(x=>x.href||x.src).filter(x=>x.startsWith(location.origin))`);
  for(const url of new Set(localLinks))assert.equal((await fetch(url)).status,200,url);
  assert.deepEqual(errors,[]);
  const result={result:'PASS',checks,content,artifacts};
  await writeFile(artifacts+'/feature-test-results.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  await call('Browser.close');
} finally {
  socket?.close();
  browser.kill();
  server.close();
}
