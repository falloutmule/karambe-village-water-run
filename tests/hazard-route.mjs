import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
fs.mkdirSync('test-results', {recursive:true});
const b=await chromium.launch({channel:'chrome'}),p=await b.newPage();
await p.addInitScript(()=>window.requestAnimationFrame=()=>0);
await p.goto(pathToFileURL(path.resolve('index.html')).href+'?dev=1');
// Simulation-driven route proof. Uses normal movement, jump, CAN and hazard updates;
// no teleports, invulnerability, hazard removal, or altered speeds. Input ownership
// itself is exercised separately in controls.mjs (including native CDP contacts).
const proof=await p.evaluate(async()=>{
const g=CR.game;g.controls=null;g.sound.setEnabled(false);const results=[];
for(const level of [2,3,2,3]){
g.startLevel(level);let steps=0;
while(g.state==='playing'&&steps++<120*180){
 const p=g.player,c=g.can;
 let move=c.full?({5:-1,4:1,3:-1,1:1,0:-1}[p.platform]||1):({0:1,1:-1,2:1,5:-1,4:-1,3:-1}[p.platform]||1);
 if((!c.full&&p.platform===5&&p.x<90)||(c.full&&p.platform===0&&p.x<90))move=0;
 g.input.left=move<0;g.input.right=move>0;
 if(!c.held){g.cancelCanAction();g.tapCan();}
 else {
  const snake=g.snakes.find(s=>!s.squashed&&s.cooldown===0&&s.platform===p.platform&&(s.x-p.x)*move>0&&Math.abs(s.x-p.x)<49);
  if(level===3&&snake&&p.grounded&&!p.climbing){
   if(c.full){g.cancelCanAction();g.tapCan();}
   else g.jump();
  }
  if(c.held&&!g.canPress)g.beginCanAction();
 }
 if(c.full&&c.held&&(!g.canPress||g.canPress.time<.17)){g.input.left=g.input.right=false;}
 g.update(1/120);
}
results.push({level,complete:g.levelCans===3,state:g.state,elapsed:g.elapsed,retries:g.levelRetries,splits:g.canSplits.slice(),steps,rocksBlocked:g.stats.rocks,snakesSquashed:g.stats.snakes});
await new Promise(r=>setTimeout(r,450));
}
return results;
});
console.log(JSON.stringify(proof));fs.writeFileSync('test-results/hazard-route.json',JSON.stringify(proof,null,2));await b.close();
if(proof.some(x=>!x.complete)||proof[0].elapsed!==proof[2].elapsed||proof[1].elapsed!==proof[3].elapsed)process.exitCode=1;
