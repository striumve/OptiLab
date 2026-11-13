import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const child=spawn(process.execPath,['server.js','--production'],{cwd,env:{...process.env,PORT:'0',OPENAI_API_KEY:'',OPENAI_MODEL:''},stdio:['ignore','pipe','pipe'],windowsHide:true});
let errors='';child.stderr.on('data',chunk=>{errors+=chunk.toString()});
try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server readiness timeout: '+errors)),15000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code+' '+errors))});child.stdout.on('data',chunk=>{const match=chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0])}})});
 const response=await fetch(url);assert.equal(response.status,200);const html=await response.text();assert.match(html,/OptiLab/);const asset=html.match(/src="([^"]+\.js)"/)[1];assert.equal((await fetch(url+asset)).status,200);
 const status=await(await fetch(url+'/api/status')).json();assert.equal(status.configured,false);
 for(const hidden of ['/.env','/.git/config'])assert.equal((await fetch(url+hidden)).status,404);
 const denied=await fetch(url+'/api/assist',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(denied.status,403);
 const missing=await fetch(url+'/api/assist',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({task:'prepare',experiment:'lens',message:'预习'})});assert.equal(missing.status,503);
 console.log('Production smoke passed: HTML, assets, API status, missing-key handling, same-origin and private-file guards.');
}finally{child.kill();}
