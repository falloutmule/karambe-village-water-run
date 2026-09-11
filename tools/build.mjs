import fs from 'node:fs';
import { build } from 'esbuild';
const manifest=JSON.parse(fs.readFileSync('src/build-manifest.json','utf8'));
if(manifest.artifact!=='index.html'||manifest.runtimeExternalDependencies.length)throw Error('Invalid single-file release contract');
const game = fs.readFileSync('src/game.js', 'utf8').replace('  /* AUDIO_MODULE */', fs.readFileSync('src/audio.js', 'utf8'));
for (const artifact of [manifest.artifact]) {
const buildId=manifest.buildId;
if(!artifact||!buildId)throw Error('Missing build identity or artifact');
const bundled = await build({stdin:{contents: "import { createGameControls } from './controls.ts';\n" + game,resolveDir:process.cwd()+'/src',loader:'js'},define:{__BUILD_ID__:JSON.stringify(buildId)},bundle:true,write:false,format:'iife',target:'es2020',legalComments:'inline',charset:'utf8'});
const script=bundled.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html=fs.readFileSync('src/game.html','utf8').replace('<!-- GAME_BUNDLE -->','<script>\n'+script+'\n</script>');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(artifact) || fs.readFileSync(artifact,'utf8')!==html) throw Error('Generated artifact differs from canonical source: '+artifact);
  if (/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html) || /\son\w+\s*=/.test(html)) throw Error('External asset or inline handler');
  console.log('PASS source/artifact parity and standalone guards: '+artifact);
} else {fs.writeFileSync(artifact,html); console.log('Built '+artifact+' ('+Buffer.byteLength(html)+' bytes)');}
}
