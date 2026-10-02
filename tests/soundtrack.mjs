import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const html = fs.readFileSync('index.html');
const manifest = JSON.parse(fs.readFileSync('src/build-manifest.json', 'utf8'));
const original = fs.readFileSync(manifest.soundtrack.path);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const embedded = html.toString().match(/data:audio\/mpeg;base64,([A-Za-z0-9+/=]+)/);
assert.ok(embedded, 'artifact contains an embedded MP3');
assert.ok(Buffer.from(embedded[1], 'base64').equals(original), 'artifact embeds the exact full supplied MP3 bytes');
assert.equal(hash(original), manifest.soundtrack.sha256, 'supplied track matches the source manifest');

const server = http.createServer((request, response) => {
  if (!['/', '/index.html'].includes(new URL(request.url, 'http://localhost').pathname)) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const checks = ['exact embedded MP3 and manifest hash'];
const errors = [], unexpected = [];
const proof = { track: manifest.soundtrack, checks, modes: [], errors, unexpected };
const contexts = [];
const check = (value, name) => { assert.ok(value, name); checks.push(name); };

async function session() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  contexts.push(context);
  await context.addInitScript(() => {
    window.__audioCreated = 0;
    window.__vibrations = 0;
    const Native = window.AudioContext;
    if (Native) window.AudioContext = new Proxy(Native, { construct(target, args) { window.__audioCreated++; return Reflect.construct(target, args); } });
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__vibrations++; return true; } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.resourceType() !== 'document' && !request.url().startsWith('data:')) unexpected.push(request.url());
  });
  return { context, page };
}

async function songState(page) {
  return page.locator('#soundtrack').evaluate(song => ({ paused: song.paused, time: song.currentTime, duration: song.duration, loop: song.loop, error: song.error?.code ?? null }));
}

async function waitPlaying(page, after = 0) {
  await page.waitForFunction(time => {
    const song = document.getElementById('soundtrack');
    return !song.paused && song.currentTime > time && song.readyState >= 2;
  }, after);
}

try {
  const { page, context } = await session();
  await page.goto(`${base}/?dev=1&clicky=1`);
  check(await page.evaluate(() => window.__audioCreated === 0 && !document.getElementById('soundtrack').hasAttribute('src')), 'song and AudioContext stay inactive before a gesture');
  await page.locator('#primaryBtn').tap();
  await waitPlaying(page);
  const playing = await songState(page);
  check(Math.abs(playing.duration - manifest.soundtrack.durationSeconds) < .15 && playing.loop && playing.error === null, 'full four-minute song decodes and loops after START');
  await page.evaluate(() => {
    const sound = CR.game.sound;
    window.__songAnalyser = sound.ctx.createAnalyser();
    window.__songAnalyser.fftSize = 2048;
    const silentSink = sound.ctx.createGain();
    silentSink.gain.value = 0;
    sound.peakGuard.connect(window.__songAnalyser);
    window.__songAnalyser.connect(silentSink).connect(sound.ctx.destination);
    sound.soundtrack.currentTime = 30;
  });
  await waitPlaying(page, 30);
  await page.waitForTimeout(100);
  const output = await page.evaluate(() => {
    const data = new Float32Array(window.__songAnalyser.fftSize);
    window.__songAnalyser.getFloatTimeDomainData(data);
    return { rms: Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length), peak: Math.max(...data.map(Math.abs)) };
  });
  check(output.rms > .001 && output.peak < 1, 'decoded song reaches the master output with measured nonzero signal and headroom');
  const loudness = await page.evaluate(async () => {
    const sound = CR.game.sound;
    const bytes = Uint8Array.from(atob(sound.soundtrack.currentSrc.split(',')[1]), character => character.charCodeAt(0));
    const decoder = new OfflineAudioContext(2, 1, sound.ctx.sampleRate);
    const track = await decoder.decodeAudioData(bytes.buffer);
    async function measure(gain, threshold, guard = false) {
      const context = new OfflineAudioContext(track.numberOfChannels, track.length, track.sampleRate);
      const source = context.createBufferSource();
      const music = context.createGain(), master = context.createGain(), limiter = context.createDynamicsCompressor();
      source.buffer = track;
      music.gain.value = .72;
      master.gain.value = gain;
      limiter.threshold.value = threshold;
      for (const key of ['knee', 'ratio', 'attack', 'release']) limiter[key].value = sound.limiter[key].value;
      source.connect(music).connect(master).connect(limiter);
      if (guard) {
        const peakGuard = context.createWaveShaper();
        peakGuard.curve = sound.peakGuard.curve;
        limiter.connect(peakGuard).connect(context.destination);
      } else limiter.connect(context.destination);
      source.start();
      const rendered = await context.startRendering();
      let sum = 0, peak = 0, clipped = 0;
      for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
        for (const sample of rendered.getChannelData(channel)) {
          sum += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
          if (Math.abs(sample) >= 1) clipped++;
        }
      }
      return { rms: Math.sqrt(sum / (rendered.length * rendered.numberOfChannels)), peak, clipped };
    }
    const previous = await measure(1.5, -6);
    const maximum = await measure(sound.master.gain.value, sound.limiter.threshold.value, true);
    return { previous, maximum, increaseDb: 20 * Math.log10(maximum.rms / previous.rms) };
  });
  assert.ok(loudness.increaseDb >= 4 && loudness.maximum.clipped === 0 && loudness.maximum.peak < .98, `full stereo soundtrack loudness/headroom: ${JSON.stringify(loudness)}`);
  checks.push('full stereo soundtrack is measurably louder than the former mix without clipping');
  const effectsOutput = await page.evaluate(async () => {
    const sound = CR.game.sound;
    sound.controlPress(); sound.hit(); sound.clear();
    let peak = 0;
    for (let i = 0; i < 50; i++) {
      const samples = new Float32Array(window.__songAnalyser.fftSize);
      window.__songAnalyser.getFloatTimeDomainData(samples);
      for (const value of samples) peak = Math.max(peak, Math.abs(value));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return { peak, voicesScheduled: sound.diagnostics.sfxVoices };
  });
  check(effectsOutput.voicesScheduled > 0 && effectsOutput.peak > .01 && effectsOutput.peak < 1, 'simultaneous control, hit and completion effects stay below clipping with the song');

  await page.locator('#menuBtn').tap();
  await page.waitForTimeout(250);
  const paused = await songState(page);
  await page.waitForTimeout(200);
  check(paused.paused && Math.abs((await songState(page)).time - paused.time) < .02, 'menu pause freezes the song position');
  await page.locator('#volumeSlider').fill('40');
  check(await page.evaluate(() => Math.abs(CR.game.sound.master.gain.value - 2.4) < .001), 'menu volume adjusts the song and effects master');
  await page.locator('#primaryBtn').tap();
  await waitPlaying(page, paused.time);
  check((await songState(page)).time < paused.time + 2, 'RESUME continues from the paused song position');

  await page.locator('#menuBtn').tap();
  await page.locator('#soundBtn').tap();
  await page.locator('#primaryBtn').tap();
  const muted = await songState(page);
  await page.waitForTimeout(200);
  check(muted.paused && (await songState(page)).time === muted.time && await page.evaluate(() => CR.game.sound.master.gain.value === 0), 'SOUND OFF pauses the song and silences all output');
  await page.locator('#menuBtn').tap();
  await page.locator('#soundBtn').tap();
  await page.locator('#primaryBtn').tap();
  await waitPlaying(page, muted.time);
  check((await songState(page)).time < muted.time + 2, 'unmute resumes the existing position');

  await page.evaluate(() => CR.game.completeLevel());
  await page.waitForFunction(() => CR.game.state === 'between');
  const between = await songState(page);
  check(between.paused, 'level completion pauses the song');
  await page.locator('#primaryBtn').tap();
  await waitPlaying(page, between.time);
  check(await page.evaluate(() => CR.game.level === 2), 'next level continues the same song');
  await page.locator('#menuBtn').tap();
  await page.locator('#secondaryBtn').tap();
  await waitPlaying(page);
  check((await songState(page)).time < 2 && await page.evaluate(() => CR.game.level === 1), 'restart full run restarts the song');
  await page.evaluate(() => { const song = document.getElementById('soundtrack'); song.currentTime = song.duration - .25; });
  await page.waitForFunction(() => {
    const song = document.getElementById('soundtrack');
    return !song.seeking && !song.paused && song.currentTime < 2;
  });
  const looped = await songState(page);
  check(!looped.paused && looped.time < 2, 'song actually wraps from the end back to the intro');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  check((await songState(page)).paused && await page.evaluate(() => CR.game.state === 'paused'), 'pagehide immediately pauses song and gameplay');

  // An interrupted play promise must not leave a permanently silent or rogue player.
  await page.evaluate(() => { CR.game.resume(); CR.game.pause(); CR.game.resume(); });
  await page.locator('#primaryBtn').tap();
  await waitPlaying(page);
  check(await page.evaluate(() => CR.game.sound.diagnostics.soundtrackError === '' && window.__vibrations === 0), 'rapid pause/resume recovers without media errors or vibration');
  await page.locator('#menuBtn').tap();
  await page.locator('#soundBtn').tap();
  await page.reload();
  check(await page.evaluate(() => window.__audioCreated === 0 && !document.getElementById('soundtrack').hasAttribute('src')) && await page.locator('#volumeSlider').inputValue() === '40', 'muted reload preserves volume and initializes no audio');
  proof.modes.push({ mode: 'HTTP phone', playing, output, loudness, effectsOutput, paused, muted, between, looped });

  // Download the exact artifact, block networking, and prove full-song playback on file:.
  const downloadSession = await session();
  await downloadSession.page.goto(base);
  const [download] = await Promise.all([downloadSession.page.waitForEvent('download'), downloadSession.page.locator('#downloadBtn').tap()]);
  fs.mkdirSync('test-results/soundtrack2', { recursive: true });
  const downloaded = path.resolve('test-results/soundtrack2/Karambe-Village-Water-Run.html');
  await download.saveAs(downloaded);
  assert.ok(fs.readFileSync(downloaded).equals(html), 'download bytes equal the full standalone artifact');
  await downloadSession.context.setOffline(true);
  await downloadSession.page.goto(pathToFileURL(downloaded).href + '?dev=1&clicky=1');
  await downloadSession.page.locator('#primaryBtn').tap();
  await waitPlaying(downloadSession.page);
  const offline = await songState(downloadSession.page);
  check(Math.abs(offline.duration - manifest.soundtrack.durationSeconds) < .15 && offline.error === null && offline.loop, 'downloaded file plays the full song with networking disabled');
  check(await downloadSession.page.evaluate(() => CR.runFullSelfCheck().pass), 'offline soundtrack game passes its runtime self-check');
  proof.modes.push({ mode: 'downloaded offline file', ...offline });
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  proof.pass = true;
  fs.mkdirSync('test-results/soundtrack2', { recursive: true });
  fs.writeFileSync('test-results/soundtrack2/proof.json', JSON.stringify(proof, null, 2));
  console.log(`PASS soundtrack: ${checks.length} checks; exact full song, decoded output, lifecycle, loop, volume/mute, downloaded offline file`);
} finally {
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
