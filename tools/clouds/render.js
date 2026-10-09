// Renders the cloud sprites in assets/clouds. Needs Playwright with Chromium.
// usage: node render.js $PWD/tools/clouds/cloudgen.html tools/clouds/specs.json assets/clouds
// Also writes _sheet.png, a contact sheet of every sprite; delete it after.
const { chromium } = require('playwright'); const fs=require('fs'), path=require('path');
const [html, specsFile, outDir] = process.argv.slice(2);
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1300,height:900}});
  await p.goto('file://'+html); const specs=JSON.parse(fs.readFileSync(specsFile,'utf8'));
  const out=await p.evaluate(s=>window.render(s), specs);
  for(const o of out){ const buf=Buffer.from(o.url.split(',')[1],'base64'); fs.writeFileSync(path.join(outDir,o.name+'.webp'),buf); console.log(o.name, buf.length, 'bytes', o.url.slice(5,15)); }
  await p.screenshot({path:path.join(outDir,'_sheet.png'),fullPage:true}); await b.close(); })();
