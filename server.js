import http from 'node:http';
import {listenWithFallback} from './server/listen.js';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAssistantHandler} from './server/assistant.js';
import {createAISettingsStore} from './server/ai-settings.js';
const root=path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root,'.env')); } catch(e) { if(e.code!=='ENOENT')throw e; }
const production=process.argv.includes('--production');
const settings=createAISettingsStore({filePath:process.env.OPTILAB_SETTINGS_PATH||path.join(root,'.local','ai-settings.json')});
const api=createAssistantHandler({settings});
const vite=production?null:await (await import('vite')).createServer({root,server:{middlewareMode:true},appType:'spa'});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try {
  const host=req.headers.host||'';
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)){res.writeHead(403).end('Local access only');return;}
  const url=new URL(req.url,'http://'+host);
  const segments=decodeURIComponent(url.pathname).split('/');if(segments.some(p=>p==='.local'||p==='.git'||p.startsWith('.env'))){res.writeHead(404).end();return;}
  if(url.pathname.startsWith('/api/')){await api(req,res);return;}
  if(vite){vite.middlewares(req,res);return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const base=path.join(root,'dist'),decoded=decodeURIComponent(url.pathname);
  let file=path.resolve(base,'.'+decoded);
  if(!file.startsWith(base+path.sep)){if(decoded==='/')file=path.join(base,'index.html');else{res.writeHead(403).end();return;}}
  try{if(!(await stat(file)).isFile())file=path.join(base,'index.html')}catch{file=path.join(base,'index.html')}
  // Dotfiles and source/configuration files are never exposed in production.
  if(decoded.split('/').some(p=>p.startsWith('.'))){res.writeHead(404).end();return;}
  const body=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:'服务暂时不可用'}))}
});
try{
 const port=await listenWithFallback(server,{port:Number(process.env.PORT||5180),onRetry:({port,code,nextPort})=>console.warn('端口 '+port+(code==='EACCES'?' 被系统禁止绑定':' 已被占用')+'，自动尝试 '+(nextPort||'系统分配的空闲端口')+'。')});
 const url='http://127.0.0.1:'+port+'/';
 console.log('OptiLab '+(production?'production':'development')+' · '+url);
 if(process.send)process.send({type:'ready',url});
}catch(error){
 console.error('启动失败：'+error.message);process.exitCode=1;await vite?.close();
 if(process.send)process.send({type:'startup-error',message:error.message});
 if(process.connected)process.disconnect();
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();vite?.close();});
