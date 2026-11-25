import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createAssistantHandler} from './server/assistant.js';
import {requestAI} from './src/assistant-client.js';

const prompt={task:'prepare',experiment:'lens',message:'解释原理'};
const encoder=new TextEncoder();
const frame=event=>'data: '+JSON.stringify(event)+'\r\n\r\n';
const completed={type:'response.completed',response:{status:'completed'}};
const textDelta=delta=>({type:'response.output_text.delta',delta});
const responsesEnv={OPENAI_API_KEY:'test',OPENAI_MODEL:'test'};

function mockBrowser(t,handler){
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  const {readable,writable}=new TransformStream();
  const writer=writable.getWriter();
  const headers={host:'localhost',origin:'http://localhost',...Object.fromEntries(new Headers(options.headers))};
  const req={url,method:options.method,headers,async *[Symbol.asyncIterator](){yield Buffer.from(options.body)}};
  const {promise,resolve}=Promise.withResolvers();
  const res=new EventEmitter();
  res.writeHead=(status,headers)=>{
   res.headersSent=true;
   resolve(new Response(readable,{status,headers}));
   return res;
  };
  res.flushHeaders=()=>{};
  res.write=text=>writer.write(encoder.encode(text));
  res.end=text=>{
   if(text)res.write(text);
   writer.close();
  };
  handler(req,res).catch(error=>writer.abort(error));
  return promise;
 });
}
function upstream(body){return new Response(body,{headers:{'Content-Type':'text/event-stream'}})}

for(const protocol of ['responses','chat-completions']){
 test(`${protocol} exposes visible text to the browser before the upstream finishes`,{timeout:3000},async t=>{
  const {promise:firstDelta,resolve:received}=Promise.withResolvers();
  const {promise:finish,resolve:release}=Promise.withResolvers();
  const responses=protocol==='responses';
  const choice=(delta,finish_reason)=>({choices:[{delta,finish_reason}]});
  const first=frame(responses?{type:'response.reasoning_text.delta',delta:'hidden'}:choice({reasoning_content:'hidden'}))
   +(responses?'event: response.output_text.delta\r\n'+frame({delta:'薄透镜'}):frame(choice({content:'薄透镜'})));
  const final=frame(responses?textDelta('公式'):choice({content:'公式'},'stop'))
   +(responses?frame(completed):'data: [DONE]\r\n\r\n');
  const stream=new ReadableStream({async start(controller){
   const bytes=encoder.encode(first),split=bytes.indexOf(encoder.encode('薄')[0])+1;
   controller.enqueue(bytes.slice(0,split));
   controller.enqueue(bytes.slice(split));
   await finish;
   controller.enqueue(encoder.encode(final));
   controller.close();
  }});
  const handler=createAssistantHandler({
   env:{AI_API_KEY:'test',AI_PROTOCOL:protocol},
   fetchImpl:async(url,options)=>{
    const payload=JSON.parse(options.body);
    assert.equal(url,'https://api.deepseek.com/'+(responses?'responses':'chat/completions'));
    assert.equal(options.headers.Accept,'text/event-stream');
    assert.equal(payload.model,'deepseek-flash');
    assert.equal(payload.stream,true);
    assert.deepEqual(responses?payload.reasoning:payload.thinking,responses?{effort:'none'}:{type:'disabled'});
    return upstream(stream);
   }
  });
  mockBrowser(t,handler);
  const previews=[];
  const reply=requestAI('/api/assist',{...prompt,task:'chat'},text=>{previews.push(text);received(text)});
  try{assert.equal(await Promise.race([firstDelta,reply]),'薄透镜');}
  finally{release();}
  assert.equal((await reply).answer,'薄透镜公式');
  assert.deepEqual(previews,['薄透镜','薄透镜公式']);
 });
}

test('a streamed retry clears the first preview and an upstream JSON reply is still usable',async t=>{
 let calls=0;
 const handler=createAssistantHandler({env:responsesEnv,fetchImpl:async()=>{
  calls++;
  if(calls===1)return upstream(frame(textDelta('未完成'))+frame({
   type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}
  }));
  return Response.json({status:'completed',output_text:'简版预习'});
 }});
 mockBrowser(t,handler);
 const previews=[];
 const reply=await requestAI('/api/assist',prompt,text=>previews.push(text));
 assert.equal(reply.answer,'简版预习');
 assert.deepEqual(previews,['未完成','']);
 assert.equal(calls,2);
});

test('a stream interrupted after the first delta reports an error instead of saving a complete answer',async t=>{
 const handler=createAssistantHandler({env:responsesEnv,fetchImpl:async()=>upstream(frame(textDelta('片段')))});
 mockBrowser(t,handler);
 const previews=[];
 await assert.rejects(requestAI('/api/assist',prompt,text=>previews.push(text)),/流式回复中断/);
 assert.deepEqual(previews,['片段']);
});
