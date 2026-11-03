import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('dist');
http.createServer(async (req,res) => {
  const file = path.resolve(root,'.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403); res.end(); return;}
  try {const data=await readFile(file); res.writeHead(200,{'Content-Type': ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)] || 'application/octet-stream'});res.end(data);}catch {res.writeHead(404);res.end();}
}).listen(5178,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5178'));
