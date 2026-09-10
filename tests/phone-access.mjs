import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const live=process.env.KARAMBE_LIVE === '1';
const base='https://falloutmule.github.io/karambe-village-water-run/';
const browser=await chromium.launch({channel:'chrome'});
const context=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
if(!live)await context.route(base+'**',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(route.request().url().includes('playtest.html')?'playtest.html':'index.html')}));
const page=await context.newPage();const errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(r.resourceType()!=='document'&&!r.url().startsWith('data:'))requests.push(r.url());});
try{
 if(live)for(const artifact of ['index.html','playtest.html']){
  const response=await fetch(base+artifact,{cache:'no-store'});assert.equal(response.status,200);
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(artifact)));checks.push('live bytes match '+artifact);
 }
 for(const [width,height] of [[320,568],[390,844],[412,915]]){
  await page.setViewportSize({width,height});await page.goto(base+'playtest.html');
  assert.equal(await page.locator('.level-pick').count(),3);
  for(const button of await page.locator('.level-pick').all()){
   const r=await button.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height&&r.x>=0&&r.x+r.width<=width);
  }
  checks.push(`all levels immediately visible ${width}x${height}`);
  for(let i=0;i<3;i++){
   await page.locator('.level-pick').nth(i).tap();
   assert.equal(await page.evaluate(()=>CR.game.level),i+1);
   assert.equal(await page.evaluate(()=>CR.game.state),'playing');
   assert.ok(await page.evaluate(()=>CR.dev&&CR.runFullSelfCheck().pass));
   await page.locator('#menuBtn').tap();
  }
  checks.push(`touch starts all three levels ${width}x${height}`);
 }
 await page.evaluate(()=>{CR.game.startLevel(3);for(let i=0;i<3;i++){CR.game.elapsed+=10;CR.game.can.full=true;CR.game.deliverCan();}});
 await page.waitForTimeout(500);
 assert.ok(await page.evaluate(()=>!localStorage.getItem('karambe-water-run-full-clear')&&!localStorage.getItem('karambe-water-run-best-times')));
 checks.push('phone testing does not write release progression');
 await page.goto(base);
 assert.ok(await page.evaluate(()=>!CR.dev&&!CR.game));
 assert.equal(await page.locator('#levelSelectBox').isVisible(),false);
 checks.push('normal first-run release remains sequential');
 if(!live){
  await page.goto(pathToFileURL(path.resolve('playtest.html')).href);
  assert.equal(await page.locator('.level-pick').count(),3);
  for(let i=0;i<3;i++){
   await page.locator('.level-pick').nth(i).tap();
   assert.equal(await page.evaluate(()=>CR.game.level),i+1);
   await page.locator('#menuBtn').tap();
  }
  assert.ok(await page.evaluate(()=>CR.runFullSelfCheck().pass));
  checks.push('downloaded playtest.html boots and starts all levels over file URL');
 }
 await page.goto(base+'playtest.html');await page.setViewportSize({width:320,height:568});
 fs.mkdirSync('test-results/phone-access',{recursive:true});
 await page.screenshot({path:'test-results/phone-access/selector.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 fs.writeFileSync('test-results/phone-access/'+(live?'live':'local')+'.json',JSON.stringify({pass:true,live,url:base+'playtest.html',checks,errors,unexpectedRequests:requests},null,2));
 console.log(JSON.stringify({pass:true,live,checks}));
}finally{await browser.close();}
