import {readFile,writeFile} from 'node:fs/promises';
const html=await readFile('dist/index.html','utf8');
const css=await readFile('dist/style.css','utf8');
const math=(await readFile('dist/fourier.js','utf8')).replaceAll('export ','');
const contours=(await readFile('dist/contours.js','utf8')).replaceAll('export ','');
const app=(await readFile('dist/app.js','utf8')).replace(/^import .*?;\r?\n/gm,'');
const result=html.replace('<link rel="stylesheet" href="./style.css"><script type="module" src="./app.js"></script>',`<style>${css}</style><script type="module">${math}\n${contours}\n${app}</script>`);
await writeFile('傅里叶画室.html',result,'utf8');
console.log('Offline app ready: 傅里叶画室.html');
