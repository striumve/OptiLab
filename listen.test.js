import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {listenWithFallback} from './server/listen.js';
class FakeServer extends EventEmitter{
 constructor(failures={}){super();this.failures=failures;this.attempts=[];}
 listen(port){this.attempts.push(port);queueMicrotask(()=>{if(this.failures[port])this.emit('error',Object.assign(Error('bind failed'),{code:this.failures[port]}));else{this.port=port||23456;this.emit('listening')}});return this}
 address(){return {port:this.port}}
}
test('denied Windows port automatically falls back without elevated privileges',async()=>{const s=new FakeServer({1037:'EACCES'}),messages=[];assert.equal(await listenWithFallback(s,{port:1037,onRetry:m=>messages.push(m)}),5180);assert.deepEqual(s.attempts,[1037,5180]);assert.equal(messages[0].code,'EACCES');assert.equal(s.listenerCount('error'),0);assert.equal(s.listenerCount('listening'),0)});
test('occupied and denied fallback ports eventually use an OS assigned port',async()=>{const failures={1037:'EADDRINUSE'};for(let p=5180;p<5200;p++)failures[p]='EACCES';const s=new FakeServer(failures);assert.equal(await listenWithFallback(s,{port:1037}),23456);assert.equal(s.attempts.at(-1),0)});
test('working configured port and PORT=0 are preserved',async()=>{const s=new FakeServer();assert.equal(await listenWithFallback(s,{port:8000}),8000);assert.deepEqual(s.attempts,[8000]);assert.equal(await listenWithFallback(new FakeServer(),{port:0}),23456)});
test('invalid ports and unrelated errors are reported instead of retried',async()=>{for(const port of [NaN,-1,65536,1.5])await assert.rejects(()=>listenWithFallback(new FakeServer(),{port}),/PORT/);const s=new FakeServer({1037:'EADDRNOTAVAIL'});await assert.rejects(()=>listenWithFallback(s,{port:1037}),{code:'EADDRNOTAVAIL'});assert.deepEqual(s.attempts,[1037])});
