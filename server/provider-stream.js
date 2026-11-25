import {readStreamLines} from '../src/stream-lines.js';

async function* events(body){
 let data=[];
 for await(const line of readStreamLines(body)){
  if(!line){
   if(data.length)yield data.join('\n');
   data=[];
  }else if(line.startsWith('data:')){
   data.push(line.slice(5).replace(/^ /,''));
  }
 }
 if(data.length)yield data.join('\n');
}

export async function readProviderStream(body,responses,onEvent,readReply,onActivity){
 let text='',finishReason,refused=false,done=false;
 for await(const data of events(body)){
  onActivity();
  if(data==='[DONE]'){
   if(!responses){done=true;break;}
   continue;
  }
  let item;
  try{item=JSON.parse(data);}catch{throw Error('AI 流式回复格式无效。');}
  if(item.error||item.type==='error')throw Error('AI 服务在生成中返回错误。');
  if(responses&&['response.completed','response.incomplete','response.failed'].includes(item.type)){
   const status=item.type.slice('response.'.length);
   return readReply({...item.response,status,output_text:item.response?.output_text??text},true);
  }
  const choice=item.choices?.[0];
  if(!responses){
   finishReason=choice?.finish_reason||finishReason;
   refused||=Boolean(choice?.delta?.refusal);
  }
  const delta=responses?(item.type==='response.output_text.delta'?item.delta:null):choice?.delta?.content;
  if(typeof delta==='string'&&delta){
   text+=delta;
   onEvent({type:'delta',text:delta});
  }
 }
 if(responses||(!done&&!finishReason))throw Error('AI 流式回复中断，未收到完成信号。');
 return readReply({choices:[{finish_reason:finishReason,message:{content:text,refusal:refused}}]},false);
}
