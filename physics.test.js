import test from 'node:test';
import assert from 'node:assert/strict';
import {imageDistance,malus,doubleSlit,traceRay} from './src/physics.js';
test('thin lens: real, virtual and infinite images',()=>{assert.equal(imageDistance(4,1.5),2.4);assert.equal(imageDistance(1,2),-2);assert.equal(imageDistance(2,2),Infinity)});
test('Malus law: parallel and crossed polarizers',()=>{assert.equal(malus(0),1);assert.ok(malus(90)<1e-20);assert.ok(Math.abs(malus(45)-.5)<1e-12)});
test('double slit: central maximum, first minimum, fringe periodicity',()=>{const l=532e-9,d=.00025,L=.6,period=l*L/d;assert.equal(doubleSlit(0,l,d,L),1);assert.ok(doubleSlit(period/2,l,d,L)<1e-20);assert.ok(Math.abs(doubleSlit(period,l,d,L)-1)<1e-12)});
test('parallel rays converge at focal plane',()=>{const pts=traceRay([{type:'lens',x:0,f:2},{type:'screen',x:2}],.3,0);assert.ok(Math.abs(pts.at(-1)[1])<1e-12)});
import {singleSlit,gratingIntensity,receiverResponse} from './src/physics.js';
import {measure,defaults} from './src/simulation.js';
import {experiments} from './src/experiments.js';
const setup=k=>experiments[k].setup.map(([type,x,z],i)=>({...defaults,id:i+1,type,x,z}));
test('single slit central maximum and first minimum',()=>{const l=532e-9,a=.0001,L=.6,y=L*Math.tan(Math.asin(l/a));assert.equal(singleSlit(0,l,a,L),1);assert.ok(singleSlit(y,l,a,L)<1e-20)});
test('grating finite at principal maxima',()=>{assert.equal(gratingIntensity(0,532e-9,1/300000,8,.6),1);for(let i=-100;i<=100;i++)assert.ok(Number.isFinite(gratingIntensity(i*.001,532e-9,1/300000,8,.6)))});
test('photodetector units and RC cutoff',()=>{const r=receiverResponse(.001,.45,10,100,100);assert.ok(Math.abs(r.current-.00045)<1e-12);assert.equal(r.voltage,4.5);const atCutoff=receiverResponse(.001,.45,10,100,r.cutoff/1000);assert.ok(Math.abs(atCutoff.gain-1/Math.sqrt(2))<1e-12);assert.ok(Math.abs(atCutoff.phase+Math.PI/4)<1e-12)});
test('free mode starts empty and all experiment presets produce finite samples',()=>{assert.equal(experiments.free.setup.length,0);const empty=measure([]);assert.equal(empty.receiver,undefined);assert.ok(empty.samples.every(s=>s.intensity===0));for(const k of Object.keys(experiments).filter(k=>k!=='free')){const m=measure(setup(k),{mode:k});assert.ok(m.receiver,k);assert.ok(m.samples.every(s=>Number.isFinite(s.intensity)&&Number.isFinite(s.voltage)),k)}});
test('free mode infers model, transverse movement disconnects receiver',()=>{const bench=setup('diffraction');assert.equal(measure(bench).active,'diffraction');bench.at(-1).z=1;const m=measure(bench);assert.equal(m.receiver,undefined);assert.ok(m.samples.every(s=>s.intensity===0))});
test('bandwidth decreases amplitude and delays phase at higher frequencies',()=>{const b=setup('bandwidth'),g=b.find(a=>a.type==='generator');g.frequency=1;const low=measure(b,{mode:'bandwidth'});g.frequency=1000;const high=measure(b,{mode:'bandwidth'});assert.ok(high.peak<low.peak);assert.ok(high.response.phase<low.response.phase);const off=measure(b,{mode:'bandwidth',playing:false});assert.equal(off.peak,0);assert.equal(off.response.current,0)});
test('changing optical power and responsivity changes detector output',()=>{const b=setup('detector'),d=b.find(a=>a.type==='detector');const a=measure(b,{mode:'detector',power:.5});d.responsivity*=2;const c=measure(b,{mode:'detector',power:.5});assert.ok(Math.abs(c.response.voltage-2*a.response.voltage)<1e-12)});

