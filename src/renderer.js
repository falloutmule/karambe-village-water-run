import {
  WORLD_W, WORLD_H, CANS_PER_LEVEL, LEVELS, ROCK_TOP_EXIT_X,
  BRIDGE_X1, BRIDGE_X2, BOTTOM_PLATFORM, UPPER_BYPASS, LOWER_BYPASS,
  clamp, lerp, rand, formatTime, mixColor
} from './game.js';

export class Renderer {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.staticBackground = document.createElement('canvas');
    this.staticTerrain = document.createElement('canvas');
    for (const layer of [this.staticBackground, this.staticTerrain]) { layer.width = WORLD_W; layer.height = WORLD_H; }
    this.buildStaticLayers();
    this.resize();
  }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (this.canvas.width !== width) this.canvas.width = width;
      if (this.canvas.height !== height) this.canvas.height = height;
      this.scaleX = this.canvas.width / WORLD_W;
      this.scaleY = this.canvas.height / WORLD_H;
    }

    buildStaticLayers() {
      const background = this.staticBackground.getContext('2d');
      const terrain = this.staticTerrain.getContext('2d');
      background.clearRect(0, 0, WORLD_W, WORLD_H);
      terrain.clearRect(0, 0, WORLD_W, WORLD_H);
      background.lineCap = terrain.lineCap = 'round';
      background.lineJoin = terrain.lineJoin = 'round';
      this.drawBackground(background);
      this.drawVillage(terrain);
      this.drawMountainPaths(terrain);
      this.drawPuddle(terrain);
      this.drawTank(terrain);
    }

    render() {
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.drawSky(ctx);
      ctx.drawImage(this.staticBackground, 0, 0);
      this.drawSun(ctx);
      ctx.drawImage(this.staticTerrain, 0, 0);
      this.drawBridge(ctx);
      this.drawChimp(ctx);
      if (this.game.hasSnakes()) this.drawSnakes(ctx);
      if (this.game.hasRocks()) this.drawRocks(ctx);
      if (!this.game.respawning && !this.game.can.held) {
        const canY = this.game.surfaceY(this.game.can.platform, this.game.can.x) - 18 - this.game.can.dropLift * 34;
        ctx.save();
        ctx.translate(this.game.can.x, canY);
        if (this.game.can.hitFlash > 0) ctx.rotate(Math.sin(this.game.elapsed * 48) * .16 * (this.game.can.hitFlash / .35));
        this.drawCan(ctx, 0, 0, 1, false, this.game.can.full);
        ctx.restore();
      }
      this.drawPlayer(ctx);
      this.drawParticles(ctx);
      this.drawWorldUI(ctx);
    }

    drawSky(ctx) {
      const p = this.game.currentLevelProgress();
      const top = p < .65 ? mixColor('rgb(74,176,221)', 'rgb(250,146,80)', p / .65) : mixColor('rgb(250,146,80)', 'rgb(56,61,88)', (p - .65) / .35);
      const bottom = p < .65 ? mixColor('rgb(182,226,218)', 'rgb(255,191,100)', p / .65) : mixColor('rgb(255,191,100)', 'rgb(103,67,87)', (p - .65) / .35);
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, top);
      g.addColorStop(.72, bottom);
      g.addColorStop(1, '#87a85d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    drawBackground(ctx) {
      ctx.fillStyle = 'rgba(53,92,90,.42)';
      ctx.beginPath();
      ctx.moveTo(0, 195); ctx.lineTo(90, 80); ctx.lineTo(165, 170); ctx.lineTo(250, 60); ctx.lineTo(350, 180); ctx.lineTo(430, 90); ctx.lineTo(480, 155); ctx.lineTo(480, 390); ctx.lineTo(0, 390); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(41,105,74,.56)';
      ctx.beginPath();
      ctx.moveTo(0, 270); ctx.lineTo(75, 165); ctx.lineTo(145, 240); ctx.lineTo(235, 130); ctx.lineTo(330, 245); ctx.lineTo(405, 155); ctx.lineTo(480, 235); ctx.lineTo(480, 470); ctx.lineTo(0, 470); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#437a44';
      ctx.beginPath();
      ctx.moveTo(0, 390); ctx.quadraticCurveTo(100, 330, 205, 395); ctx.quadraticCurveTo(325, 315, 480, 390); ctx.lineTo(480, 860); ctx.lineTo(0, 860); ctx.closePath(); ctx.fill();
      // sparse trees in the world, never side borders
      for (const [x, y, s] of [[32,300,.8],[451,270,.72],[27,535,.76],[455,555,.84],[356,760,.62],[130,780,.58]]) this.drawTree(ctx, x, y, s);
    }

    drawTree(ctx, x, y, s) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = '#4e3824'; ctx.fillRect(-3, 0, 6, 24);
      ctx.fillStyle = '#235c37';
      for (const [dx,dy,r] of [[0,-4,14],[-10,5,11],[10,5,11],[0,10,12]]) { ctx.beginPath(); ctx.arc(dx,dy,r,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }

    drawSun(ctx) {
      const p = this.game.currentLevelProgress();
      const x = 350 + Math.sin(Math.PI * p) * 26;
      const y = lerp(76, 430, p);
      const radius = 72;
      const warm = clamp((p - .58) / .42, 0, 1);
      ctx.save();
      const glow = ctx.createRadialGradient(x, y, radius * .35, x, y, radius * 1.62);
      glow.addColorStop(0, 'rgba(255,244,160,.56)');
      glow.addColorStop(.52, 'rgba(255,196,85,.23)');
      glow.addColorStop(1, 'rgba(255,156,70,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, radius * 1.62, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mixColor('rgb(255,228,103)', 'rgb(255,119,66)', warm);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = .28;
      ctx.fillStyle = '#fffbd6';
      ctx.beginPath(); ctx.arc(x - 20, y - 23, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    drawVillage(ctx) {
      this.drawHut(ctx, 18, 114, .85, '#d99042');
      this.drawHut(ctx, 105, 123, .68, '#cc7441');
      ctx.fillStyle = '#42673a';
      ctx.beginPath(); ctx.ellipse(72, 149, 74, 17, 0, 0, Math.PI*2); ctx.fill();
    }

    drawHut(ctx, x, y, s, wall) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s,s);
      ctx.fillStyle = wall; ctx.fillRect(0,0,55,35);
      ctx.fillStyle = '#6a3c24'; ctx.fillRect(22,13,13,22);
      ctx.fillStyle = '#e4bb5b'; ctx.beginPath(); ctx.moveTo(-8,2); ctx.lineTo(27,-20); ctx.lineTo(64,2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = 3;
      for (let i=-4;i<62;i+=8) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i+26,-17); ctx.stroke(); }
      ctx.restore();
    }

    drawMountainPaths(ctx) {
      for (let i = 0; i < this.game.platforms.length; i++) {
        if (i === 2) {
          this.drawPathSegment(ctx, i, this.game.platforms[i].x1, BRIDGE_X1);
          this.drawPathSegment(ctx, i, BRIDGE_X2, this.game.platforms[i].x2);
        } else {
          this.drawPathSegment(ctx, i, this.game.platforms[i].x1, this.game.platforms[i].x2);
        }
      }
      this.drawRockChute(ctx, ROCK_TOP_EXIT_X, this.game.surfaceY(0, ROCK_TOP_EXIT_X), this.game.surfaceY(1, ROCK_TOP_EXIT_X));
      this.drawSteps(ctx, 420, this.game.surfaceY(0,420), this.game.surfaceY(1,420), -1);
      this.drawSteps(ctx, 75, this.game.surfaceY(1,75), this.game.surfaceY(2,75), 1);
      this.drawSteps(ctx, 420, this.game.surfaceY(2,420), this.game.surfaceY(BOTTOM_PLATFORM,420), -1);
      this.drawSteps(ctx, 35, this.game.surfaceY(BOTTOM_PLATFORM,35), this.game.surfaceY(LOWER_BYPASS,35), 1);
      this.drawSteps(ctx, 385, this.game.surfaceY(LOWER_BYPASS,385), this.game.surfaceY(UPPER_BYPASS,385), -1);
      this.drawSteps(ctx, 25, this.game.surfaceY(UPPER_BYPASS,25), this.game.surfaceY(1,25), 1);
      this.drawRouteSigns(ctx);
    }

    drawRouteSigns(ctx) {
      const bridgeY = this.game.surfaceY(2, 260) - 44;
      ctx.save();
      ctx.fillStyle = '#70502d';
      ctx.fillRect(248, bridgeY - 4, 5, 36);
      ctx.fillStyle = '#f2ce68';
      ctx.beginPath(); ctx.roundRect(205, bridgeY - 28, 91, 28, 5); ctx.fill();
      ctx.strokeStyle = '#6f4e28'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3b2b20'; ctx.font = '900 9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('EMPTY CAN ONLY', 250.5, bridgeY - 11);

      const routeY = this.game.surfaceY(BOTTOM_PLATFORM, 130) - 52;
      ctx.fillStyle = '#70502d';
      ctx.fillRect(126, routeY - 2, 5, 35);
      ctx.fillStyle = '#ffd85a';
      ctx.beginPath(); ctx.roundRect(72, routeY - 28, 112, 28, 5); ctx.fill();
      ctx.strokeStyle = '#6f4e28'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3b2b20'; ctx.font = '900 10px system-ui';
      ctx.fillText('← FULL CAN PATH', 128, routeY - 11);
      ctx.restore();
    }

    drawPathSegment(ctx, index, x1, x2) {
      const y1 = this.game.surfaceY(index, x1), y2 = this.game.surfaceY(index, x2);
      ctx.strokeStyle = '#5c3424'; ctx.lineWidth = 46;
      ctx.beginPath(); ctx.moveTo(x1, y1 + 8); ctx.lineTo(x2, y2 + 8); ctx.stroke();
      ctx.strokeStyle = '#a6633d'; ctx.lineWidth = 34;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = '#d28a4b'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x1, y1 - 15); ctx.lineTo(x2, y2 - 15); ctx.stroke();
      ctx.strokeStyle = '#3d733d'; ctx.lineWidth = 7;
      ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(x1, y1 - 18); ctx.lineTo(x2, y2 - 18); ctx.stroke();
      ctx.setLineDash([]);
    }

    drawSteps(ctx, x, y1, y2, side) {
      const top = Math.min(y1,y2), bottom = Math.max(y1,y2);
      ctx.strokeStyle = '#5a3425'; ctx.lineWidth = 28;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.fillStyle = '#a9643e';
      const n = 6;
      for (let i=0;i<n;i++) {
        const y = lerp(top, bottom, (i+.5)/n);
        ctx.fillRect(x - 15, y - 6, 30, 10);
        ctx.fillStyle = '#d18a4d'; ctx.fillRect(x - 15, y - 6, 30, 3); ctx.fillStyle = '#a9643e';
      }
      ctx.strokeStyle = '#3a6b39'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + side*18, top); ctx.lineTo(x + side*18, bottom); ctx.stroke();
    }

    drawRockChute(ctx, x, y1, y2) {
      const top = Math.min(y1, y2), bottom = Math.max(y1, y2);
      ctx.save();
      ctx.strokeStyle = '#4a372d';
      ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.strokeStyle = '#776254';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 9, top); ctx.lineTo(x - 9, bottom); ctx.moveTo(x + 9, top); ctx.lineTo(x + 9, bottom); ctx.stroke();
      ctx.fillStyle = '#8b7b6d';
      for (let y = top + 13; y < bottom - 7; y += 24) {
        ctx.beginPath(); ctx.arc(x + (Math.floor(y / 24) % 2 ? -2 : 3), y, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffe47a';
      ctx.font = '900 8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('ROCK CHUTE', x, top - 8);
      ctx.restore();
    }

    drawBridge(ctx) {
      const y1 = this.game.surfaceY(2, BRIDGE_X1), y2 = this.game.surfaceY(2, BRIDGE_X2);
      const b = this.game.bridge;
      ctx.save();
      const warningShake = b.state === 'warning' && !this.game.reducedMotion ? Math.sin(b.shake * 44) * 2.4 : 0;
      ctx.translate(0, warningShake);
      ctx.strokeStyle = '#4c3324'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(BRIDGE_X1 - 5, y1 - 20); ctx.quadraticCurveTo(260, (y1+y2)/2 - 10, BRIDGE_X2 + 5, y2 - 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(BRIDGE_X1 - 5, y1 + 5); ctx.quadraticCurveTo(260, (y1+y2)/2 + 15, BRIDGE_X2 + 5, y2 + 5); ctx.stroke();
      let visibleT = 1;
      if (b.state === 'rebuilding') visibleT = 1 - b.timer / .65;
      const count = 8;
      for (let i=0;i<count;i++) {
        if (b.state === 'collapsed' && i > 1 && i < count-2) continue;
        if (b.state === 'rebuilding' && i/count > visibleT) continue;
        const t = i/(count-1);
        let x = lerp(BRIDGE_X1, BRIDGE_X2, t);
        let y = lerp(y1, y2, t);
        if (b.state === 'collapsed' && (i===1 || i===count-2)) y += 18;
        ctx.save(); ctx.translate(x,y); ctx.rotate(.08*Math.sin(i*2.2));
        ctx.fillStyle = b.state === 'warning' && i%2 ? '#b47d41' : '#8a5a33';
        ctx.fillRect(-10,-13,20,25);
        ctx.fillStyle = '#c89353'; ctx.fillRect(-10,-13,20,4);
        ctx.strokeStyle = '#50301f'; ctx.lineWidth = 1.5; ctx.strokeRect(-10,-13,20,25);
        if (b.state === 'warning' && i===3) { ctx.beginPath(); ctx.moveTo(-2,-10); ctx.lineTo(4,-2); ctx.lineTo(-3,8); ctx.stroke(); }
        ctx.restore();
      }
      ctx.restore();
    }

    drawPuddle(ctx) {
      const y = this.game.surfaceY(BOTTOM_PLATFORM, 70) + 20;
      ctx.fillStyle = 'rgba(49,89,66,.45)'; ctx.beginPath(); ctx.ellipse(70, y+11, 69, 18, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#54a7c8'; ctx.beginPath(); ctx.ellipse(70, y, 58, 15, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#a8e4e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(61,y-1,25,.2,2.4); ctx.stroke();
      ctx.fillStyle = '#3f6c42';
      for (const x of [20,33,111,120]) { ctx.beginPath(); ctx.moveTo(x,y+4); ctx.lineTo(x-4,y-14); ctx.lineTo(x+1,y-4); ctx.lineTo(x+5,y-17); ctx.lineTo(x+7,y+5); ctx.fill(); }
      ctx.font = '900 12px system-ui'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fillText('WATER',70,y+35);
    }

    drawTank(ctx) {
      const x=48, y=this.game.surfaceY(0,65)-48;
      ctx.save(); ctx.translate(x,y);
      ctx.fillStyle='#777e76'; ctx.fillRect(-22,-15,44,43);
      ctx.fillStyle='#a9b1a8'; ctx.fillRect(-19,-12,38,8);
      ctx.strokeStyle='#343b36'; ctx.lineWidth=3; ctx.strokeRect(-22,-15,44,43);
      ctx.fillStyle='#58a7c8'; ctx.fillRect(-16,10,32,12);
      ctx.fillStyle='#d8d7bf'; ctx.fillRect(18,2,13,5); ctx.fillRect(26,2,5,11);
      ctx.restore();
    }

    drawChimp(ctx) {
      const c = this.game.chimp;
      const x = 420, y = 99;
      ctx.save(); ctx.translate(x,y);
      ctx.fillStyle='#6b4b32'; ctx.fillRect(-38,25,76,12);
      ctx.fillStyle='#8b6941'; ctx.fillRect(-34,24,68,4);
      const active = this.game.hasRocks();
      const bounce = this.game.reducedMotion ? 0 : active && c.phase === 'windup' ? -3 : Math.sin(this.game.elapsed*3)*1.2;
      ctx.translate(0,bounce);
      ctx.strokeStyle='#3a251d'; ctx.lineWidth=8;
      ctx.beginPath(); ctx.moveTo(-14,18); ctx.lineTo(-25,31); ctx.moveTo(14,18); ctx.lineTo(25,31); ctx.stroke();
      ctx.fillStyle='#3e2d26'; ctx.beginPath(); ctx.ellipse(0,7,18,23,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(0,-13,15,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#b5885f'; ctx.beginPath(); ctx.ellipse(0,-10,10,8,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#16120f'; ctx.beginPath(); ctx.arc(-4,-14,1.6,0,Math.PI*2); ctx.arc(4,-14,1.6,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#3e2d26'; ctx.lineWidth=8;
      if (active && c.phase === 'windup') {
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-18,-24); ctx.moveTo(10,0); ctx.lineTo(18,-24); ctx.stroke();
        ctx.fillStyle='#75675a'; ctx.beginPath(); ctx.arc(0,-38,11,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#473d36'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-5,-43); ctx.lineTo(3,-35); ctx.lineTo(7,-43); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-21,14); ctx.moveTo(10,0); ctx.lineTo(21,14); ctx.stroke();
      }
      ctx.restore();
    }

    drawSnakes(ctx) {
      for (const s of this.game.snakes) {
        const y = this.game.surfaceY(s.platform, s.x);
        ctx.save(); ctx.translate(s.x,y-4);
        if (s.squashed) {
          ctx.strokeStyle='#b6cc31'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(-14,0); ctx.quadraticCurveTo(-5,4,2,0); ctx.quadraticCurveTo(9,-4,15,0); ctx.stroke();
          ctx.fillStyle='#d7e84b'; ctx.beginPath(); ctx.ellipse(14,-1,7,4,0,0,Math.PI*2); ctx.fill();
        } else {
          ctx.strokeStyle='#aacb30'; ctx.lineWidth=8;
          ctx.beginPath(); ctx.moveTo(-16,2); ctx.bezierCurveTo(-8,-7+Math.sin(s.phase)*2,0,9,9,0); ctx.stroke();
          ctx.fillStyle='#d9e84a'; ctx.beginPath(); ctx.ellipse(14,-3,8,6,.15,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#1d2918'; ctx.beginPath(); ctx.arc(17,-5,1.3,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle='#d6523d'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(21,-2); ctx.lineTo(26,-1); ctx.moveTo(25,-1); ctx.lineTo(28,-3); ctx.moveTo(25,-1); ctx.lineTo(28,1); ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawRocks(ctx) {
      for (const r of this.game.rocks) {
        ctx.save(); ctx.translate(r.x,r.y); ctx.rotate(r.spin);
        ctx.fillStyle='#71675d'; ctx.beginPath(); ctx.arc(0,0,r.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#423b36'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-4,-7); ctx.lineTo(2,-1); ctx.lineTo(-2,6); ctx.moveTo(3,-6); ctx.lineTo(7,-1); ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(-3,-4,3,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
    }

    drawPlayer(ctx) {
      const p = this.game.player;
      if (p.dead || this.game.respawning) return;
      const blink = p.invuln > 0 && Math.floor(p.invuln*14)%2===0;
      if (blink) return;
      ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.facing,1);
      const walk = p.grounded && !p.climbing ? Math.sin(p.step) : 0;
      const climbing = !!p.climbing;
      ctx.strokeStyle='#39251b'; ctx.lineWidth=6;
      if (climbing) {
        ctx.beginPath(); ctx.moveTo(-5,-14); ctx.lineTo(-11,4); ctx.moveTo(5,-14); ctx.lineTo(11,4); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-5,-14); ctx.lineTo(-7+walk*4,3); ctx.moveTo(5,-14); ctx.lineTo(8-walk*4,3); ctx.stroke();
      }
      ctx.fillStyle='#f0a33f'; ctx.beginPath(); ctx.roundRect(-10,-38,20,25,7); ctx.fill();
      ctx.fillStyle='#285c75'; ctx.fillRect(-10,-20,20,8);
      ctx.fillStyle='#6c3c24'; ctx.beginPath(); ctx.arc(0,-49,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#2b1b14'; ctx.beginPath(); ctx.arc(-1,-53,9,Math.PI,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(4,-50,1.4,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#6c3c24'; ctx.lineWidth=5;
      if (this.game.can.held) {
        const workingCan = this.game.isWorkingCan();
        if (p.blocking) {
          ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(20,-35); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(12,-29); ctx.stroke();
          this.drawCan(ctx, 28, -34, 1, true, this.game.can.full);
        } else if (workingCan) {
          ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(17,-19); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(9,-17); ctx.stroke();
          this.drawCan(ctx, 22, -12, 1, false, this.game.can.full);
        } else {
          const headBob = p.grounded && !climbing ? Math.abs(walk) * 1.2 : 0;
          ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(9,-61-headBob); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-7,-34); ctx.lineTo(-9,-61-headBob); ctx.stroke();
          this.drawCan(ctx, 0, -75-headBob, 1, false, this.game.can.full);
        }
      } else {
        ctx.beginPath(); ctx.moveTo(7,-34); ctx.lineTo(14,-18); ctx.moveTo(-7,-34); ctx.lineTo(-13,-19); ctx.stroke();
      }
      ctx.restore();
    }

    drawCan(ctx, x, y, facing=1, blocking=false, full=false) {
      ctx.save(); ctx.translate(x,y); if (blocking) ctx.rotate(-.18);
      ctx.fillStyle='#edc323'; ctx.beginPath(); ctx.roundRect(-10,-15,20,30,4); ctx.fill();
      ctx.strokeStyle='#6f5710'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#142a27'; ctx.fillRect(-4,-12,8,6);
      ctx.strokeStyle='#6f5710'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(-5,-13); ctx.lineTo(-5,-19); ctx.lineTo(5,-19); ctx.lineTo(5,-13); ctx.stroke();
      ctx.fillStyle=full ? '#4fa2c8' : 'rgba(255,255,255,.28)'; ctx.fillRect(-6,full ? -1 : 5,12,full ? 12 : 6);
      if (full) { ctx.strokeStyle='#dff6ff'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-5,1); ctx.quadraticCurveTo(0,-1,5,1); ctx.stroke(); ctx.fillStyle='#dff6ff'; ctx.beginPath(); ctx.arc(5,-7,2.2,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const q of this.game.particles) {
        ctx.globalAlpha = clamp(q.life/.6,0,1);
        ctx.fillStyle=q.color; ctx.beginPath(); ctx.arc(q.x,q.y,q.size,0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1;
    }

    drawWorldUI(ctx) {
      const p = this.game.player;
      const levelLabel = `L${this.game.level}  ${this.game.levelConfig().name}  •  ${this.game.levelCans}/${CANS_PER_LEVEL}`;
      ctx.save();
      ctx.font = '950 20px system-ui';
      const levelW = ctx.measureText(levelLabel).width + 19;
      ctx.fillStyle = 'rgba(12,31,21,.72)';
      ctx.beginPath(); ctx.roundRect(8, 55, levelW, 25, 10); ctx.fill();
      ctx.fillStyle = '#fff1aa';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(levelLabel, 18, 68);
      const timeLabel = formatTime(this.game.elapsed);
      ctx.font = '950 20px system-ui';
      const timeW = ctx.measureText(timeLabel).width + 20;
      const timeX = WORLD_W - timeW - 8;
      ctx.fillStyle = 'rgba(12,31,21,.82)';
      ctx.beginPath(); ctx.roundRect(timeX, 55, timeW, 25, 10); ctx.fill();
      ctx.fillStyle = '#fff1aa';
      ctx.textAlign = 'center';
      ctx.fillText(timeLabel, timeX + timeW / 2, 68);
      ctx.restore();
      let prompt = '';
      if (this.game.state === 'playing') {
        if (this.game.respawning) prompt = this.game.message;
        else if (this.game.can.held && !this.game.can.full && p.platform === BOTTOM_PLATFORM && p.x < 112 && p.grounded) prompt = 'HOLD CAN TO FILL';
        else if (this.game.can.held && this.game.can.full && p.platform === 0 && p.x < 112 && p.grounded) prompt = 'HOLD CAN TO POUR';
        else if (this.game.can.held && this.game.can.full && p.platform === BOTTOM_PLATFORM && p.x < 125 && p.grounded) prompt = 'FULL CAN — TAKE THE LONG PATH LEFT';
        else if (this.game.can.held && this.game.can.full && p.platform === 2 && p.x > BRIDGE_X1 - 45 && p.x < BRIDGE_X2 + 45) prompt = 'BRIDGE TOO WEAK — TAKE THE LONG PATH';
        else if (!this.game.can.held && this.game.can.platform === p.platform && Math.abs(this.game.can.x-p.x)<45) prompt = 'TAP CAN TO PICK UP';
        else if (p.fullCanWarning > 0) prompt = 'FULL CAN — SET IT DOWN TO JUMP';
        else if (this.game.messageTimer > 0) prompt = this.game.message;
      }
      if (prompt) {
        ctx.save(); ctx.font='900 14px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
        const w=Math.min(390,ctx.measureText(prompt).width+28);
        ctx.fillStyle='rgba(12,31,21,.79)'; ctx.beginPath(); ctx.roundRect((WORLD_W-w)/2,17,w,31,13); ctx.fill();
        ctx.fillStyle='#fff6cb'; ctx.fillText(prompt,WORLD_W/2,33);
        ctx.restore();
      }
      const progress = this.game.can.fill || this.game.can.pour;
      if (progress > 0) {
        const x=p.x, y=p.y-82;
        ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(x,y,17,-Math.PI/2,Math.PI*1.5); ctx.stroke();
        ctx.strokeStyle=this.game.can.fill?'#70d4ef':'#ffd94e'; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(x,y,17,-Math.PI/2,-Math.PI/2+Math.PI*2*progress); ctx.stroke();
      }
      if (this.game.scoreFlash > 0) {
        const flash = `CAN ${Math.min(this.game.levelCans, CANS_PER_LEVEL)}/${CANS_PER_LEVEL}`;
        ctx.save(); ctx.globalAlpha=clamp(this.game.scoreFlash/.35,0,1); ctx.font='950 32px system-ui'; ctx.textAlign='center'; ctx.fillStyle='#ffe05b'; ctx.strokeStyle='rgba(0,0,0,.55)'; ctx.lineWidth=6; ctx.strokeText(flash,WORLD_W/2,92); ctx.fillText(flash,WORLD_W/2,92); ctx.restore();
      }
    }
}
