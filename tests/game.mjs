import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
fs.mkdirSync('test-results', {recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))requests.push(r.url());});
await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
await page.goto(pathToFileURL(path.resolve('index.html')).href+'?dev=1');
await page.locator('#primaryBtn').click();
const checks=await page.evaluate(async()=>{
 const g=CR.game; const controls=g.controls; g.controls=null; g.sound.setEnabled(false);
 const checks=[]; const ok=(name,v,details='')=>{checks.push({name,pass:!!v,details});if(!v)throw Error(name+': '+JSON.stringify(details));};
 const tick=(n=1)=>{for(let i=0;i<n;i++)g.update(1/120);};
 const place=(platform,x)=>{Object.assign(g.player,{platform,x,y:g.surfaceY(platform,x),grounded:true,climbing:null,vx:0,vy:0,connectorLock:null});g.syncHeldCan();};
 const restart=(level=1)=>{g.startLevel(level);g.cancelControlTouches('test');};
 restart();
 for(const facing of [-1,1]){place(0,230);g.player.facing=facing;g.can.held=true;g.forceDropCan();ok('drop in front '+facing,(g.can.x-g.player.x)*facing>0);}
 for(const [x,facing] of [[30,-1],[420,1]]){place(0,x);g.player.facing=facing;g.can.held=true;g.forceDropCan();ok('edge refuses backward placement '+facing,g.can.held);}
 restart();g.jump();tick();ok('empty can jumps',!g.player.grounded&&g.player.vy<0);
 restart();g.can.full=true;g.jump();tick();ok('full can cannot jump',g.player.grounded);
 place(0,200);g.forceDropCan();g.jump();tick();ok('drop full can then jump',!g.player.grounded&&!g.can.held);
 tick(130);g.tapCan();ok('retrieve full can after landing',g.can.held&&g.can.full);
 restart();place(5,70);g.beginCanAction();tick(160);ok('hold fills',g.can.full);g.endCanAction();
 place(5,420);g.tryConnector(1);ok('full bottom shortcut forbidden',!g.player.climbing);
 place(2,190);g.player.facing=1;g.input.right=true;tick(40);ok('full walkway blocked',g.player.x<=191);g.input.right=false;
 restart();place(2,250);g.triggerBridge();ok('bridge warns',g.bridge.state==='warning');const version=g.attemptVersion;tick(100);ok('bridge failure immediate current-can retry',g.attemptVersion>version&&g.player.platform===0&&g.can.held&&!g.can.full&&!g.respawning);
 restart();g.triggerBridge();tick(100);ok('walkway collapses away from player',g.bridge.state==='collapsed');tick(600);ok('walkway respawns',g.bridge.state==='solid');
 restart(3);place(1,220);g.can.full=true;g.player.facing=1;g.snakes[0].x=250;g.forceDropCan();ok('full can crushes snake',g.snakes[0].squashed);const delay=g.snakes[0].respawnDelay;g.snakes[0].respawn=.01;g.updateSnakes(.02);ok('snake respawns on deterministic schedule',!g.snakes[0].squashed&&g.snakes[0].x===g.snakes[0].startX&&g.snakes[0].cooldown===.8,delay);
 restart(3);const snake=g.snakes[0];place(1,snake.x);g.player.grounded=false;g.player.vy=100;g.player.prevY=g.surfaceY(1,snake.x)-25;g.player.y=g.surfaceY(1,snake.x)-15;g.checkSnakeCollisions();ok('empty can descending stomp',snake.squashed&&g.player.vy<0);
 restart(3);place(1,g.snakes[0].x);g.checkSnakeCollisions();ok('snake side contact retries',g.levelRetries===1&&g.player.platform===0);
 restart(2);place(0,250);const rock={state:'rolling',platform:1,x:250,y:g.player.y-21,r:10.5};g.checkRockCollision(rock,g.player);ok('no cross-path collision',g.levelRetries===0);
 rock.platform=0;g.checkRockCollision(rock,g.player);ok('same path rock hits',g.levelRetries===1);
 restart(2);place(0,200);g.rocks=[200,201].map(x=>({state:'rolling',platform:0,x,y:g.player.y-10.5,r:10.5,vx:0,spin:0}));tick();ok('simultaneous rocks count exactly one retry',g.levelRetries===1&&g.player.x===62&&g.rocks.length===0);
 restart(2);place(0,200);g.forceDropCan();const droppedX=g.can.x;g.rocks=[{state:'rolling',platform:0,x:droppedX,y:g.surfaceY(0,droppedX)-10.5,r:10.5,vx:0,spin:0}];tick();ok('lowering animation cannot let rock through placed can',g.rocks.length===0&&g.levelRetries===0&&g.can.x===droppedX);
 restart();place(5,70);g.beginCanAction();tick(160);place(0,70);tick(120);ok('continuous CAN hold fills then pours',g.levelCans===1);
 restart();place(5,70);g.beginCanAction();tick(17);g.endCanAction();ok('partial fill release never drops can',g.can.held);
 restart(2);place(0,420);g.player.climbing={from:1,to:0,x:420};g.checkRockCollision({state:'connector',connector:{from:0,to:1,x:378},x:420,y:g.player.y-21},g.player);ok('dedicated chute cannot hit final ladder',g.levelRetries===0);
 restart(2);place(0,240);g.player.facing=1;g.beginCanAction();tick(24);g.checkRockCollision({state:'rolling',platform:0,x:250,y:g.player.y-21},g.player);ok('facing hold blocks',g.levelRetries===0&&g.stats.rocks===1);
 restart(2);place(0,240);g.can.full=true;g.forceDropCan();g.can.dropLift=0;const cx=g.can.x;g.hitLooseCanWithRock({x:cx,y:g.surfaceY(0,cx)-10});ok('placed can stops rock without displacement',g.can.x===cx&&g.can.vx===0);
 restart(2);g.throwRock(270);let maxStep=0;let prev={...g.rocks[0]},seen=new Set();for(let i=0;i<2400&&g.rocks.length;i++){g.updateRocks(1/120);const r=g.rocks[0];if(r){seen.add(r.state+':'+r.platform);maxStep=Math.max(maxStep,Math.hypot(r.x-prev.x,r.y-prev.y));prev={...r};}}ok('rock continuous route and connectors',maxStep<6&&seen.has('connector:null')&&seen.has('rolling:5'),{maxStep,states:[...seen]});
 restart();g.levelCans=2;g.elapsed=52;g.canStartElapsed=40;g.tripProgress=.8;g.can.full=true;g.failCurrentCan('ROCK HIT');ok('retry preserves cans timer and split origin',g.levelCans===2&&g.elapsed===52&&g.canStartElapsed===40&&g.canSplits.length===0);ok('sun rolls back current segment only',g.currentLevelProgress()===2/3);tick(120);ok('timer continues retry',g.elapsed>52.99&&g.player.platform===0);
 // Complete the authored L1 route through ordinary simulation, no position teleporting.
 restart();const route=[];
 for(let can=0;can<3;can++){
   const runUntil=(condition,move,max=4000)=>{g.input.left=move<0;g.input.right=move>0;let n=0;while(!condition()&&n++<max&&g.state==='playing')tick();g.input.left=g.input.right=false;if(n>=max)throw Error('route stalled '+JSON.stringify({p:g.player,c:g.can}));};
   runUntil(()=>g.player.platform===1&&!g.player.climbing,1);
   runUntil(()=>g.player.platform===2&&!g.player.climbing,-1);
   runUntil(()=>g.player.platform===5&&!g.player.climbing,1);
   runUntil(()=>g.player.x<90,-1);
   g.beginCanAction();tick(170);g.endCanAction();ok('route can '+(can+1)+' fills',g.can.full);
   runUntil(()=>g.player.platform===4&&!g.player.climbing,-1);
   runUntil(()=>g.player.platform===3&&!g.player.climbing,1);
   runUntil(()=>g.player.platform===1&&!g.player.climbing,-1);
   runUntil(()=>g.player.platform===0&&!g.player.climbing,1);
   runUntil(()=>g.player.x<90,-1);
   g.beginCanAction();runUntil(()=>g.levelCans>can,0,200);g.endCanAction();route.push(g.elapsed);
 }
 ok('three genuine L1 route deliveries',g.levelCans===3&&g.levelRetries===0&&g.canSplits.length===3,route);
 const finish=g.elapsed;await new Promise(r=>setTimeout(r,450));ok('level timer stops',g.elapsed===finish&&g.state==='singleComplete');
 ok('development cannot persist unlock',localStorage.getItem('karambe-water-run-full-clear')!=='1');
 const before=JSON.stringify({p:g.player,c:g.can,s:g.snakes,r:g.rocks,e:g.elapsed,progress:g.tripProgress});g.render();g.render();ok('render does not mutate gameplay',before===JSON.stringify({p:g.player,c:g.can,s:g.snakes,r:g.rocks,e:g.elapsed,progress:g.tripProgress}));
 g.controls=controls;g.start();document.getElementById('overlay').classList.remove('open');g.render();ok('built read-only selfcheck',CR.runFullSelfCheck().pass);return checks;
});
await page.screenshot({path:'test-results/gameplay.png'});
if(errors.length||requests.length)throw Error(JSON.stringify({errors,requests}));
await page.goto(pathToFileURL(path.resolve('index.html')).href);
if(await page.locator('#levelSelectBox').isVisible())throw Error('Release first-run Level Select exposed');
if(await page.evaluate(()=>!!CR.game))throw Error('Release exposes mutable game debug API');
await page.screenshot({path:'test-results/release-menu.png'});
fs.writeFileSync('test-results/game.json',JSON.stringify({pass:true,checks,errors,unexpectedRequests:requests,physicalPhone:'not tested'},null,2));
console.log('PASS '+checks.length+' gameplay checks; release menu locked; no unexpected network or console errors');
await browser.close();


