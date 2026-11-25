export async function* readStreamLines(stream) {
 const reader=stream.getReader();
 const decoder=new TextDecoder();
 let buffer='',finished=false;
 try {
  while(!finished){
   const {value,done}=await reader.read();
   finished=done;
   buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
   let end;
   while((end=buffer.indexOf('\n'))!==-1){
    const line=buffer.slice(0,end).replace(/\r$/,'');
    buffer=buffer.slice(end+1);
    yield line;
   }
  }
  if(buffer)yield buffer.replace(/\r$/,'');
 }finally{
  if(!finished)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
