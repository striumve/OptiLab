import {readStreamLines} from './stream-lines.js';

export async function requestAI(url,payload,onText){
 const response=await fetch(url,{
  method:'POST',
  headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},
  body:JSON.stringify(payload)
 });
 if(!response.headers.get('content-type')?.includes('application/x-ndjson')){
  const result=await response.json();
  if(!response.ok||result.error)throw Error(result.error||'AI 请求失败');
  return result;
 }
 let text='';
 for await(const line of readStreamLines(response.body)){
  if(!line.trim())continue;
  const event=JSON.parse(line);
  if(event.type==='delta'){
   text+=event.text;
   onText?.(text);
  }else if(event.type==='reset'){
   text='';
   onText?.(text);
  }else if(event.type==='done'){
   return event.result;
  }else if(event.type==='error'){
   throw Error(event.error||'AI 请求失败');
  }
 }
 throw Error('AI 回复连接中断，请重试。');
}
