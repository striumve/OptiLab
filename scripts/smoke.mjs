import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const settingsDirectory=await mkdtemp(path.join(tmpdir(),'optilab-smoke-'));
const child=spawn(process.execPath,['server.js','--production'],{cwd,env:{...process.env,PORT:'0',OPENAI_API_KEY:'',OPENAI_MODEL:'',AI_API_KEY:'',AI_MODEL:'',AI_BASE_URL:'https://api.openai.com/v1',AI_PROTOCOL:'responses',OPTILAB_SETTINGS_PATH:path.join(settingsDirectory,'ai-settings.json')},stdio:['ignore','pipe','pipe'],windowsHide:true});
let errors='';child.stderr.on('data',chunk=>{errors+=chunk.toString()});
try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server readiness timeout: '+errors)),15000);child.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited: '+code+' '+errors))});child.stdout.on('data',chunk=>{const match=chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0])}})});
 const response=await fetch(url);assert.equal(response.status,200);const html=await response.text();assert.match(html,/OptiLab/);const asset=html.match(/src="([^"]+\.js)"/)[1];assert.equal((await fetch(url+asset)).status,200);
 const status=await(await fetch(url+'/api/status')).json();assert.equal(status.configured,false);
 for(const hidden of ['/.env','/.git/config','/.local/ai-settings.json'])assert.equal((await fetch(url+hidden)).status,404);
 const denied=await fetch(url+'/api/assist',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(denied.status,403);
 const missing=await fetch(url+'/api/assist',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({task:'prepare',experiment:'lens',message:'预习'})});assert.equal(missing.status,503);
 const saved=await fetch(url+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({provider:'QA',baseUrl:'https://provider.example/v1',protocol:'chat-completions',model:'test',apiKey:'mock-secret'})});assert.equal(saved.status,200);const publicSettings=await saved.json();assert.equal(publicSettings.hasApiKey,true);assert.ok(!JSON.stringify(publicSettings).includes('mock-secret'));const reset=await fetch(url+'/api/settings',{method:'DELETE',headers:{Origin:url}});assert.equal(reset.status,200);
 console.log('Production smoke passed: HTML, assets, API status, missing-key handling, same-origin and private-file guards.');
}finally{if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,5000);child.once('exit',()=>{clearTimeout(timer);resolve()});child.kill()});if(path.dirname(settingsDirectory)!==path.resolve(tmpdir())||!path.basename(settingsDirectory).startsWith('optilab-smoke-'))throw Error('Invalid cleanup path');await rm(settingsDirectory,{recursive:true,force:true});}
