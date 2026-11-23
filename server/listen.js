/** Bind directly (no probe/bind race), retry Windows-denied or occupied ports. */
export async function listenWithFallback(server,{port=5180,host='127.0.0.1',onRetry=()=>{}}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('PORT 必须是 0 到 65535 之间的整数。');
 const candidates=[...new Set([port,...Array.from({length:20},(_,i)=>5180+i),0])];
 for(let i=0;i<candidates.length;i++){
  const candidate=candidates[i];
  try{
   await new Promise((resolve,reject)=>{
    const failed=error=>{server.off('listening',ready);reject(error)};
    const ready=()=>{server.off('error',failed);resolve()};
    server.once('error',failed);server.once('listening',ready);server.listen(candidate,host);
   });
   return server.address().port;
  }catch(error){
   if(!['EACCES','EADDRINUSE'].includes(error.code)||i===candidates.length-1)throw error;
   onRetry({port:candidate,code:error.code,nextPort:candidates[i+1]});
  }
 }
}
