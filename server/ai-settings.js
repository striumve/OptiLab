import {readFile,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
export function normalizeBaseUrl(value){
 let u;try{u=new URL(String(value||'').trim())}catch{throw Error('请输入有效的 API 服务地址')}
 const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(local&&u.protocol==='http:'))throw Error('远程服务须使用 HTTPS；本机 localhost / 127.0.0.1 可使用 HTTP');
 if(u.username||u.password||u.search||u.hash)throw Error('服务地址不能包含账号、密码、查询参数或片段');
 u.pathname=u.pathname.replace(/\/(chat\/completions|responses)\/?$/,'').replace(/\/+$/,'');
 return u.toString().replace(/\/+$/,'');
}
export const endpointFor=c=>c.baseUrl+(c.protocol==='responses'?'/responses':'/chat/completions');
export const isConfigured=c=>!!(c.model&&(c.apiKey||['localhost','127.0.0.1','[::1]'].includes(new URL(c.baseUrl).hostname)));
export function createAISettingsStore({env=process.env,filePath}={}){
 const environment=()=>({provider:env.AI_PROVIDER||'OpenAI',baseUrl:normalizeBaseUrl(env.AI_BASE_URL||env.OPENAI_BASE_URL||'https://api.openai.com/v1'),protocol:env.AI_PROTOCOL||'responses',model:env.AI_MODEL||env.OPENAI_MODEL||'',apiKey:env.AI_API_KEY||env.OPENAI_API_KEY||''});
 let saved=null,loaded=false;let queue=Promise.resolve();
 async function get(){if(!loaded){if(filePath){try{const value=JSON.parse(await readFile(filePath,'utf8'));saved=validate(value,null)}catch(e){if(e.code!=='ENOENT')throw Error('本地 AI 设置读取失败，请检查 .local/ai-settings.json')}}loaded=true}return saved?{...saved}:environment()}
 function validate(data,previous){
  if(!data||typeof data!=='object')throw Error('AI 设置格式无效');
  const baseUrl=normalizeBaseUrl(data.baseUrl),protocol=data.protocol||'chat-completions';
  if(!['responses','chat-completions'].includes(protocol))throw Error('请选择 Responses 或 Chat Completions 协议');
  const model=String(data.model||'').trim(),provider=String(data.provider||'自定义服务').trim();
  if(model.length>200||provider.length>80||!model||/[\r\n]/.test(model))throw Error('请填写有效的模型 ID（最多 200 字符）');
  if(data.apiKey!==undefined&&typeof data.apiKey!=='string')throw Error('API Key 格式无效');
  const key=(data.apiKey||'').trim();if(key.length>4096||/[\r\n]/.test(key))throw Error('API Key 格式无效');
  if(previous?.apiKey&&baseUrl!==previous.baseUrl&&!key&&!data.clearApiKey)throw Error('更换服务地址时须重新填写 API Key，原密钥不会发送给新服务商');
  const apiKey=data.clearApiKey?'':key||(previous&&baseUrl===previous.baseUrl?previous.apiKey:'');
  return {provider,baseUrl,protocol,model,apiKey};
 }
 async function candidate(data){return validate(data,await get())}
 async function save(data){const operation=queue.then(async()=>{const config=await candidate(data);if(filePath){await mkdir(path.dirname(filePath),{recursive:true});const temp=filePath+'.tmp';await writeFile(temp,JSON.stringify(config,null,2),{mode:0o600});await rename(temp,filePath)}saved=config;return config});queue=operation.catch(()=>{});return operation}
 async function reset(){const operation=queue.then(async()=>{if(filePath)await unlink(filePath).catch(e=>{if(e.code!=='ENOENT')throw e});saved=null;loaded=true;return environment()});queue=operation.catch(()=>{});return operation}
 function publicConfig(config){const {apiKey,...rest}=config;return {...rest,configured:isConfigured(config),hasApiKey:!!apiKey,source:saved?'application':'environment',endpoint:endpointFor(config)}}
 return {get,candidate,save,reset,publicConfig};
}
