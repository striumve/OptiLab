import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistantHandler} from './server/assistant.js';
async function request(handler,body,{method='POST',url='/api/assist',origin='http://127.0.0.1:5180',raw}={}){let status,headers,payload;const req={url,method,headers:{host:'127.0.0.1:5180',origin,'content-type':'application/json'},async *[Symbol.asyncIterator](){yield Buffer.from(raw??JSON.stringify(body))}};const res={writeHead(s,h){status=s;headers=h;return this},end(text){payload=JSON.parse(text)}};await handler(req,res);return {status,headers,...payload};}
const prompt={task:'prepare',experiment:'lens',message:'解释原理'};
test('AI status and missing credentials are explicit and leak no key',async()=>{const h=createAssistantHandler({env:{}});const a=await request(h,null,{method:'GET',url:'/api/status'});assert.equal(a.configured,false);const b=await request(h,prompt);assert.equal(b.status,503);assert.equal(b.code,'AI_NOT_CONFIGURED')});
test('assistant rejects foreign origins, malformed JSON and unsupported tasks',async()=>{const h=createAssistantHandler({env:{}});assert.equal((await request(h,prompt,{origin:'https://foreign.example'})).status,403);assert.equal((await request(h,null,{raw:'invalid'})).status,400);assert.equal((await request(h,{...prompt,task:'run-shell'})).status,400);assert.equal((await request(h,{...prompt,message:'a'.repeat(170000)})).status,413)});
test('Responses payload keeps key server-side, disables storage and extracts text',async()=>{let received;const h=createAssistantHandler({env:{OPENAI_API_KEY:'test-not-a-real-key',OPENAI_MODEL:'test-model'},fetchImpl:async(url,opts)=>{received={url,...opts,body:JSON.parse(opts.body)};return {ok:true,json:async()=>({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'解释完成'}]}]})}}});const r=await request(h,{...prompt,analysis:{n:5},dataSource:'示例'});assert.equal(r.answer,'解释完成');assert.equal(received.url,'https://api.openai.com/v1/responses');assert.equal(received.body.store,false);assert.equal(received.headers.Authorization,'Bearer test-not-a-real-key');assert.ok(!JSON.stringify(r).includes('test-not-a-real-key'));assert.ok(received.body.instructions.includes('不得编造'));});
test('upstream errors and timeouts are actionable, never return provider secrets',async()=>{for(const status of [401,429,500]){const h=createAssistantHandler({env:{OPENAI_API_KEY:'secret',OPENAI_MODEL:'test'},fetchImpl:async()=>({ok:false,status})});const r=await request(h,prompt);assert.equal(r.status,502);assert.ok(!JSON.stringify(r).includes('secret'))}const h=createAssistantHandler({env:{OPENAI_API_KEY:'secret',OPENAI_MODEL:'test'},fetchImpl:async()=>{throw Object.assign(Error(),{name:'TimeoutError'})}});assert.match((await request(h,prompt)).error,/超时/)});
import {createAISettingsStore,normalizeBaseUrl} from './server/ai-settings.js';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('custom service supports chat completions and keeps credentials private',async()=>{const settings=createAISettingsStore({env:{}});let received;const h=createAssistantHandler({settings,env:{},fetchImpl:async(url,opts)=>{received={url,...opts,body:JSON.parse(opts.body)};return {ok:true,json:async()=>({choices:[{message:{content:'第三方回答'},finish_reason:'stop'}]})}}});const saved=await request(h,{provider:'自定义',baseUrl:'https://school.example/v1/chat/completions',protocol:'chat-completions',model:'optics-model',apiKey:'private-key'},{url:'/api/settings'});assert.equal(saved.status,200);assert.equal(saved.hasApiKey,true);assert.equal(saved.baseUrl,'https://school.example/v1');assert.ok(!JSON.stringify(saved).includes('private-key'));const answer=await request(h,prompt);assert.equal(answer.answer,'第三方回答');assert.equal(answer.provider,'自定义');assert.equal(received.url,'https://school.example/v1/chat/completions');assert.equal(received.body.messages[0].role,'system');assert.equal(received.body.model,'optics-model');assert.equal(received.redirect,'error');assert.equal(received.headers.Authorization,'Bearer private-key');assert.equal(received.body.stream,false)});
test('changing hosts does not reuse an existing provider key',async()=>{const settings=createAISettingsStore({env:{OPENAI_API_KEY:'original-secret',OPENAI_MODEL:'old-model'}});await assert.rejects(()=>settings.save({baseUrl:'https://other.example/v1',protocol:'responses',model:'new',apiKey:''}),/更换/);const c=await settings.save({baseUrl:'https://api.openai.com/v1',protocol:'responses',model:'new',apiKey:''});assert.equal(c.apiKey,'original-secret');assert.equal((await settings.save({baseUrl:'http://localhost:11434/v1',protocol:'chat-completions',model:'local',clearApiKey:true})).apiKey,'')});
test('connection tests use candidate config without saving or transmitting scene data',async()=>{const settings=createAISettingsStore({env:{}});let body;const h=createAssistantHandler({settings,fetchImpl:async(url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'OK'}}]})}}});const r=await request(h,{baseUrl:'http://127.0.0.1:11434/v1',protocol:'chat-completions',model:'local'},{url:'/api/settings/test'});assert.equal(r.answer,'OK');assert.equal(r.status,200);assert.equal((await settings.get()).baseUrl,'https://api.openai.com/v1');assert.ok(!JSON.stringify(body).includes('scene'));assert.equal(body.messages[1].content,'Reply OK.')});
test('invalid service URLs and unsafe settings mutations are rejected',async()=>{for(const url of ['file:///etc/passwd','http://remote.example/v1','https://key:secret@example.com/v1','https://example.com/v1?key=secret','https://example.com/v1#x'])assert.throws(()=>normalizeBaseUrl(url));assert.equal(normalizeBaseUrl('https://school.example/v1/responses/'),'https://school.example/v1');const h=createAssistantHandler({env:{}});assert.equal((await request(h,{baseUrl:'https://example.com/v1',model:'a',protocol:'unknown'},{url:'/api/settings'})).status,400);assert.equal((await request(h,{baseUrl:'https://example.com/v1',model:'a'},{url:'/api/settings',origin:'https://other.example'})).status,403);assert.equal((await request(h,null)).status,400)});
test('settings persist across restarts and reset restores environment',async()=>{const dir=await mkdtemp(path.join(tmpdir(),'optilab-settings-'));try{const filePath=path.join(dir,'ai-settings.json'),s=createAISettingsStore({env:{},filePath});await s.save({baseUrl:'https://example.com/v1',protocol:'chat-completions',model:'m',apiKey:'test-secret'});assert.equal(JSON.parse(await readFile(filePath,'utf8')).apiKey,'test-secret');const restarted=createAISettingsStore({env:{OPENAI_MODEL:'env-model'},filePath});assert.equal((await restarted.get()).model,'m');const r=await restarted.reset();assert.equal(r.model,'env-model');assert.equal(r.apiKey,'');}finally{assert.equal(path.dirname(dir),path.resolve(tmpdir()));assert.ok(path.basename(dir).startsWith('optilab-settings-'));await rm(dir,{recursive:true,force:true})}});
import {analyzeTable,parseTable,summarizeAnalysis} from './src/analysis.js';

const interpretPrompt={
 ...prompt,task:'interpret',message:'请解读实验结果。',
 dataSource:'示例',
 analysis:summarizeAnalysis(analyzeTable(parseTable('x,y\n1,2\n2,4\n3,6'),{method:'linear'}))
};
const finishedResponses=answer=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:answer}]}]});

test('DeepSeek result interpretation reserves the output for a final answer in either protocol',async()=>{
 for(const protocol of ['responses','chat-completions']){
  let body;
  const handler=createAssistantHandler({
   env:{AI_BASE_URL:'https://api.deepseek.com',AI_PROTOCOL:protocol,AI_MODEL:'deepseek-flash',AI_API_KEY:'dummy'},
   fetchImpl:async(_url,options)=>{
    body=JSON.parse(options.body);
    const result=protocol==='responses'?finishedResponses('斜率约为 2。'):{choices:[{message:{content:[{type:'text',text:'斜率约为 2。'}]}}]};
    return {ok:true,json:async()=>result};
   }
  });
  const response=await request(handler,interpretPrompt);
  assert.equal(response.answer,'斜率约为 2。');
  assert.equal(protocol==='responses'?body.reasoning?.effort:body.thinking?.type,protocol==='responses'?'none':'disabled');
  assert.match((body.input||body.messages).find(item=>item.content.startsWith('实验资料')).content,/"slope":2/);
 }
});

test('interpretation retries once on budget exhaustion without final text and ignores reasoning output',async()=>{
 const requests=[];
 const handler=createAssistantHandler({
  env:{OPENAI_API_KEY:'dummy',OPENAI_MODEL:'test'},
  fetchImpl:async(_url,options)=>{
   requests.push(JSON.parse(options.body));
   const result=requests.length===1
    ? {status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[{type:'reasoning',content:[{type:'reasoning_text',text:'internal'}]}]}
    : {status:'completed',output_text:'拟合得到斜率 2。'};
   return {ok:true,json:async()=>result};
  }
 });
 const response=await request(handler,interpretPrompt);
 assert.equal(response.answer,'拟合得到斜率 2。');
 assert.deepEqual(requests.map(body=>body.max_output_tokens),[4000,8000]);
 assert.deepEqual(requests[0].input,requests[1].input);
 assert.equal(requests[0].reasoning,undefined);
});

test('partial final text is preserved, filtered replies are not retried, and empty limits are diagnosed',async()=>{
 const cases=[
  [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:'已有解读。'},1,{answer:'已有解读。',incomplete:true}],
  [{status:'incomplete',incomplete_details:{reason:'content_filter'},output:[]},1,{error:/拦截/}],
  [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]},2,{error:/输出长度上限/}],
  [{status:'completed',output:[]},1,{error:/空回复/}],
 ];
 for(const [result,expectedCalls,expected] of cases){
  let calls=0;
  const handler=createAssistantHandler({
   env:{OPENAI_API_KEY:'dummy',OPENAI_MODEL:'test'},
   fetchImpl:async()=>{calls++;return {ok:true,json:async()=>result}}
  });
  const response=await request(handler,interpretPrompt);
  assert.equal(calls,expectedCalls);
  if(expected.error){assert.equal(response.status,502);assert.match(response.error,expected.error);}
  else{assert.equal(response.answer,expected.answer);assert.equal(response.incomplete,true);}
 }
});

test('preparation retries with concise instructions and preserves complete material if the model hits its limit again',async()=>{
 for(const protocol of ['responses','chat-completions']){
  for(const recover of [true,false]){
   const requests=[];
   const handler=createAssistantHandler({
    env:{AI_BASE_URL:'https://api.deepseek.com',AI_PROTOCOL:protocol,AI_MODEL:'deepseek-flash',AI_API_KEY:'dummy'},
    fetchImpl:async(_url,options)=>{
     requests.push(JSON.parse(options.body));
     const completed=recover&&requests.length===2;
     const result=protocol==='responses'
      ? completed?finishedResponses('完整预习'):{
       status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:requests.length===1?'':'未完成的预习'
      }
      : {choices:[{finish_reason:completed?'stop':'length',message:{content:completed?'完整预习':'未完成的预习'}}]};
     return {ok:true,json:async()=>result};
    }
   });
   const response=await request(handler,prompt);
   assert.equal(response.status,200);
   assert.deepEqual(requests.map(body=>body.max_output_tokens??body.max_tokens),[4000,8000]);
   for(const body of requests)assert.equal(body.reasoning?.effort??body.thinking?.type,protocol==='responses'?'none':'disabled');
   const retryInstructions=requests[1].instructions??requests[1].messages[0].content;
   assert.match(retryInstructions,/简版预习/);
   if(recover)assert.equal(response.answer,'完整预习');
   else{
    assert.equal(response.fallback,'output_limit');
    assert.equal(response.answer,undefined);
   }
  }
 }
});

test('report review sends the full report once, then retries a timeout with a shorter answer prompt',async()=>{
 const payloads=[];
 const report='## 实验报告正文\n测量值与结论。';
 const handler=createAssistantHandler({
  env:{AI_BASE_URL:'https://api.deepseek.com',AI_PROTOCOL:'responses',AI_MODEL:'deepseek-flash',AI_API_KEY:'dummy'},
  fetchImpl:async(_url,options)=>{
   payloads.push({body:JSON.parse(options.body),signal:options.signal});
   if(payloads.length===1)throw Object.assign(Error(),{name:'TimeoutError'});
   return {ok:true,json:async()=>finishedResponses('补全物距和像距的单位。')};
  }
 });
 const response=await request(handler,{...prompt,task:'review',message:report,scene:{items:[{type:'lens'}]}});
 assert.equal(response.answer,'补全物距和像距的单位。');
 assert.equal(payloads.length,2);
 assert.notEqual(payloads[0].signal,payloads[1].signal);
 for(const {body} of payloads){
  assert.equal(body.reasoning.effort,'none');
  assert.equal(body.input.filter(item=>item.content.includes(report)).length,1);
  assert.ok(!Object.hasOwn(JSON.parse(body.input[0].content.split('\n')[1]),'scene'));
 }
 assert.match(payloads[1].body.instructions,/3 条/);
});

test('report review preserves a partial answer if length recovery times out, otherwise returns a local fallback',async()=>{
 for(const partial of ['检查单位。','']){
  let count=0;
  const handler=createAssistantHandler({
   env:{OPENAI_API_KEY:'dummy',OPENAI_MODEL:'mock'},
   fetchImpl:async()=>{
    if(++count===2)throw Object.assign(Error(),{name:'TimeoutError'});
    return {ok:true,json:async()=>({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:partial})};
   }
  });
  const response=await request(handler,{...prompt,task:'review',message:'检查报告'});
  assert.equal(count,2);
  assert.equal(response.status,200);
  if(partial){assert.equal(response.answer,partial);assert.equal(response.incomplete,true);}
  else assert.equal(response.fallback,'timeout');
 }
});

test('preparation instructs the model to use delimiters supported by the LaTeX renderer',async()=>{
 let instructions;
 const handler=createAssistantHandler({
  env:{OPENAI_API_KEY:'dummy',OPENAI_MODEL:'mock'},
  fetchImpl:async(_url,options)=>{
   ({instructions}=JSON.parse(options.body));
   return {ok:true,json:async()=>finishedResponses('预习内容')};
  }
 });
 assert.equal((await request(handler,prompt)).status,200);
 assert.ok(instructions.includes(String.raw`\(...\)`));
 assert.ok(instructions.includes(String.raw`\[\frac{1}{f}=\frac{1}{u}+\frac{1}{v}\]`));
});
