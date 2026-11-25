import {wavelengthColor} from './spectrum.js';
import {normalizeScene} from './notebooks.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {TYPES,malus,traceRay} from './physics.js';
import {experiments} from './experiments.js';
import {defaults,measure} from './simulation.js';
const $=s=>document.querySelector(s);let id=0,mode='free',selected=null,playing=true,items=[],groups=[],drag=null;let wavelength=532,power=1;let currentMeasurement;
const scene=new THREE.Scene();scene.background=new THREE.Color('#e8eef5');scene.fog=new THREE.Fog('#e8eef5',22,48);const camera=new THREE.PerspectiveCamera(39,1,.1,100);camera.position.set(12,12,15);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;$('#viewport').append(renderer.domElement);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.7,0);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2.05;controls.minDistance=7;controls.maxDistance=30;
scene.add(new THREE.HemisphereLight(0xffffff,0x8b9bb3,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(2,12,7);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-10,right:10,top:10,bottom:-10});scene.add(light);
const mat=(color,metalness=0,roughness=.5)=>new THREE.MeshStandardMaterial({color,metalness,roughness});const navy=mat('#34465b',.65,.3),metal=mat('#c7d1db',.8,.25),dark=mat('#1e2b3c',.5,.35),blue=mat('#3284dc',.35,.3);
function box(w,h,d,m,x=0,y=0,z=0,parent=scene){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o}
function cyl(r,h,m,x,y,z,parent){const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,40),m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o}
box(15,.45,7,mat('#aab7c5',.65,.5),0,-.3,0);box(14.8,.05,6.8,mat('#d0d9e2',.55,.45),0,-.05,0);box(200,.1,200,mat('#e8eef5'),0,-1,0);
const holes=new THREE.InstancedMesh(new THREE.CylinderGeometry(.032,.032,.015,8),dark,55*23);let hi=0;const dummy=new THREE.Object3D();for(let x=-6.75;x<=6.76;x+=.25)for(let z=-2.75;z<=2.76;z+=.25){dummy.position.set(x,-.012,z);dummy.updateMatrix();holes.setMatrixAt(hi++,dummy.matrix)}scene.add(holes);
const rayGroup=new THREE.Group();scene.add(rayGroup);const screenCanvas=document.createElement('canvas');screenCanvas.width=512;screenCanvas.height=256;const screenTexture=new THREE.CanvasTexture(screenCanvas);
const scopeCanvas=document.createElement('canvas');scopeCanvas.width=600;scopeCanvas.height=160;const scopeTexture=new THREE.CanvasTexture(scopeCanvas);
scopeTexture.colorSpace=THREE.SRGBColorSpace;
screenTexture.colorSpace=THREE.SRGBColorSpace;

function panelDisplay(group, texture, width, height, x, y, z){
 const display=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture}));
 display.position.set(x,y,z);
 group.add(display);
}

function frontKnob(group,radius,material,x,y,z){
 const knob=cyl(radius,.09,material,x,y,z,group);
 knob.rotation.x=Math.PI/2;
}

function drawGenerator(group,device){
 // Low, silver chassis with a frequency readout and a large control dial.
 const housing=mat('#d6dfe7',.18,.42);
 const amber=mat('#e5a63d',.18,.4);
 box(1.85,.66,1.06,housing,0,.45,0,group);
 box(1.75,.57,.04,navy,0,.45,.54,group);
 box(1.58,.04,.68,device.id===selected?blue:metal,0,.795,0,group);
 frontKnob(group,.19,metal,.62,.47,.61);
 box(.025,.095,.012,navy,.62,.55,.66,group);
 frontKnob(group,.078,amber,.26,.3,.61);
 frontKnob(group,.039,dark,.26,.3,.66);
 for(const x of [-.69,-.47,-.25])box(.14,.065,.035,metal,x,.26,.58,group);
 const canvas=document.createElement('canvas');
 canvas.width=480;canvas.height=134;
 const screen=canvas.getContext('2d');
 screen.fillStyle='#222018';screen.fillRect(0,0,480,134);
 screen.fillStyle='#ffc36a';screen.font='bold 55px monospace';
 screen.fillText(device.frequency+' kHz',16,59);
 screen.font='bold 27px monospace';
 screen.fillText('MOD '+Math.round(device.depth*100)+'%',16,109);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 group.userData.displayTexture=texture;
 panelDisplay(group,texture,1.04,.29,-.26,.52,.566);
}

function drawScope(group,device){
 // Taller enclosure with a gridded display, separate controls and two channel inputs.
 const casing=mat('#283644',.2,.45);
 const bezel=mat('#121e2b',.15,.5);
 const channelOne=mat('#e6b842');
 box(2.12,1.23,.9,casing,0,.72,0,group);
 box(1.96,1.1,.045,bezel,0,.72,.46,group);
 box(1.87,.038,.59,device.id===selected?blue:navy,0,1.35,0,group);
 panelDisplay(group,scopeTexture,1.43,.82,-.24,.8,.486);
 for(const y of [.61,.94])frontKnob(group,.108,metal,.72,y,.53);
 for(const x of [.6,.84])box(.11,.07,.035,metal,x,1.11,.51,group);
 frontKnob(group,.074,channelOne,.59,.32,.53);
 frontKnob(group,.074,blue,.84,.32,.53);
 for(const x of [.59,.84])frontKnob(group,.037,bezel,x,.32,.58);
}

function instrument(a){const g=new THREE.Group();g.position.x=a.x;g.position.z=a.z||0;g.userData.id=a.id;if(!['generator','scope'].includes(a.type)){box(.72,.18,.85,navy,0,.25,.2,g);box(.62,.035,.65,a.id===selected?blue:metal,0,.36,.2,g);cyl(.065,1.1,metal,0,.88,0,g);cyl(.12,.12,dark,0,.48,0,g);}
if(a.type==='generator'){
 drawGenerator(g,a);
}else if(a.type==='scope'){
 drawScope(g,a);
}else if(a.type==='detector'){
box(.55,.8,.85,navy,0,1.55,0,g);const eye=cyl(.22,.08,dark,-.32,1.55,0,g);eye.rotation.z=Math.PI/2;
box(.07,.26,.26,blue,-.37,1.55,0,g);
}else if(a.type==='laser'){box(1.15,.56,.6,navy,-.2,1.55,0,g);box(.17,.35,.4,metal,.44,1.55,0,g);const o=cyl(.1,.18,dark,.58,1.55,0,g);o.rotation.z=Math.PI/2;box(.55,.012,.3,blue,-.25,1.84,0,g)}else if(a.type==='screen'){box(.12,2.15,2.7,navy,0,1.65,0,g);const p=new THREE.Mesh(new THREE.PlaneGeometry(2.45,1.85),new THREE.MeshBasicMaterial({map:screenTexture,side:THREE.DoubleSide}));p.rotation.y=-Math.PI/2;p.position.set(-.071,1.65,0);g.add(p);const back=p.clone();back.position.x=.071;g.add(back)}else{const ring=new THREE.Mesh(new THREE.TorusGeometry(.63,.065,12,64),navy);ring.rotation.y=Math.PI/2;ring.position.y=1.55;g.add(ring);const glass=new THREE.Mesh(new THREE.CylinderGeometry(.58,.58,.065,64),new THREE.MeshPhysicalMaterial({color:a.type==='lens'?'#9bd8f2':a.type==='slit'?'#34445c':'#80aebc',transparent:true,opacity:a.type==='lens'?.35:.78,metalness:.1,roughness:.12,side:THREE.DoubleSide}));glass.rotation.z=Math.PI/2;glass.position.y=1.55;g.add(glass);if(['slit','aperture','grating'].includes(a.type)){for(const z of (a.type==='slit'?[-.06,.06]:a.type==='aperture'?[0]:[-.3,-.2,-.1,0,.1,.2,.3]))box(.075,.42,.018,mat('#e2f3fc'),0,1.55,z,g)}if(a.type==='polarizer'){for(let j=-4;j<=4;j++){const l=box(.08,.018,.85,metal,0,1.55+j*.095,0,g);l.rotation.x=a.angle*Math.PI/180}}}
scene.add(g);groups.push(g)}
function disposeGroup(g){g.userData.displayTexture?.dispose();const materials=new Set();g.traverse(o=>{o.geometry?.dispose();if(o.material&&! [navy,metal,dark,blue].includes(o.material))materials.add(o.material)});materials.forEach(m=>m.dispose());scene.remove(g)}
function rebuild(){groups.forEach(disposeGroup);groups=[];items.forEach(instrument);$('#empty-state').hidden=items.length>0;$('#count').textContent=`${items.length} 件仪器 · WebGL 3D`;update()}
function add(type,x,z=0){const a={...defaults,id:++id,type,x:x??Math.max(-5,Math.min(5,-4+(items.length%7)*1.35)),z};items.push(a);selected=a.id;document.body.classList.remove('hide-inspector');$('#inspector-toggle').setAttribute('aria-expanded','true');rebuild();inspect()}
function preset(key){mode=key;items=[];id=0;wavelength=532;power=1;playing=true;$('#toggle').textContent='⏸ 暂停光源';
for(const [type,x,z] of experiments[key].setup)add(type,x,z);
selected=(key==='polar'?items.filter(a=>a.type==='polarizer').at(-1):items.find(a=>!['laser','screen','scope','generator'].includes(a.type)))?.id??null;
$('#scene-title').textContent=experiments[key].name;$('#theory-title').textContent=experiments[key].title;$('#formula').textContent=experiments[key].formula;$('#theory-text').textContent=experiments[key].text;$('#steps').innerHTML=experiments[key].steps;
document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b.dataset.mode===key));$('#empty-state').hidden=items.length>0;rebuild();inspect();}
$('#presets').innerHTML=Object.entries(experiments).map(([k,e])=>`<button class="preset" data-mode="${k}"><span class="icon">${e.icon}</span><span>${e.name}<small>${e.en}</small></span></button>`).join('');document.querySelectorAll('.preset').forEach(b=>b.onclick=()=>preset(b.dataset.mode));$('#library').innerHTML=Object.entries(TYPES).map(([k,t])=>`<button data-type="${k}"><b>${t.icon}</b>${t.name} ＋</button>`).join('');document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>add(b.dataset.type));
function field(name,key,value,min,max,step,unit){return `<div class="field"><label>${name}<output id="out-${key}">${Number(value).toFixed(step<1?2:0)} ${unit}</output></label><input aria-label="${name}" data-key="${key}" data-unit="${unit}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`}
function inspect(){const a=items.find(a=>a.id===selected);if(!a){$('#inspector').innerHTML='<p class="muted">从场景中选择仪器，或从仪器库添加。</p>';return}let html=`<div class="selected-card"><b>${TYPES[a.type].icon} ${TYPES[a.type].name}</b><small>OPTICAL ELEMENT / ${String(a.id).padStart(2,'0')}</small></div>`;html+=field('台面 X 位置','x',a.x*10,-60,60,.1,'cm');html+=field('台面 Z 位置','z',(a.z||0)*10,-25,25,.1,'cm');if(a.type==='laser'){html+=field('激光波长','wavelength',wavelength,380,750,1,'nm')+field('相对功率','power',power,0,1,.01,'');}if(a.type==='lens')html+=field('焦距','f',a.f*10,5,40,.1,'cm');if(a.type==='slit')html+=field('双缝间距','d',a.d,.1,.8,.01,'mm');if(a.type==='polarizer')html+=field('透光轴角度','angle',a.angle,0,180,1,'°');if(a.type==='aperture')html+=field('单缝宽度','width',a.width,.02,.4,.01,'mm');
if(a.type==='grating')html+=field('光栅线密度','density',a.density,100,1000,10,'线/mm')+field('有效缝数','slits',a.slits,2,20,1,'');
if(a.type==='detector')html+=field('响应度','responsivity',a.responsivity,.1,.9,.01,'A/W')+field('负载电阻','load',a.load,1,50,.1,'kΩ')+field('等效电容','capacitance',a.capacitance,10,500,10,'pF');
if(a.type==='generator')html+=field('调制频率','frequency',a.frequency,1,1000,1,'kHz')+field('调制深度','depth',a.depth,0,1,.01,'');
if(a.type==='scope')html+='<p class="muted">自动连接台面探测器。显示两周期交流波形；无发生器时显示直流电平。</p>';
html+='<button class="delete" id="delete">移除此仪器</button>';$('#inspector').innerHTML=html;document.querySelectorAll('input[data-key]').forEach(el=>el.oninput=()=>{const k=el.dataset.key,v=+el.value;if(k==='wavelength')wavelength=v;else if(k==='power')power=v;else a[k]=['x','z','f'].includes(k)?v/10:v;$('#out-'+k).textContent=`${v.toFixed(+el.step<1?2:0)} ${el.dataset.unit}`;if(k==='wavelength'||k==='power')update();else rebuild()});$('#delete').onclick=()=>{items=items.filter(i=>i.id!==selected);selected=null;rebuild();inspect()}}
function line(points,c,opacity=1){const o=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color:c,transparent:true,opacity}));rayGroup.add(o)}
let samples=[],lastMeasurement={};
function update(){
while(rayGroup.children.length){const o=rayGroup.children[0];o.geometry.dispose();o.material.dispose();rayGroup.remove(o)}
const m=measure(items,{mode,wavelength,power,playing});currentMeasurement=m;samples=m.samples;lastMeasurement=m.metadata;
const {laser,receiver,optics,lens,slit,aperture,grating,detector,generator,scope}=m,hex=wavelengthColor(wavelength),c=new THREE.Color(hex);
if(laser&&playing){
 if(lens&&m.active==='lens'){for(const slope of [-.06,0,.06])line(traceRay(optics,.2,slope,6,laser.x).map(p=>[p[0],1.55+p[1],laser.z]),c,.8)}
 else {let prev=[laser.x,1.55,laser.z];for(const a of optics){line([prev,[a.x,1.55,laser.z]],c,.8);prev=[a.x,1.55,laser.z]}if(!receiver)line([prev,[6.5,1.55,laser.z]],c,.8);
 const diffractor=grating||aperture||slit;if(diffractor&&receiver)for(const dz of [-.8,0,.8])line([[diffractor.x,1.55,laser.z],[receiver.x,1.55,laser.z+dz]],c,.22);}
}
function cable(from,to){
 line([from,[from[0],.15,from[2]+.22],[to[0],.15,to[2]+.22],to],'#e6a33c',.9);
}
if(generator&&laser)cable([generator.x+.26,.3,generator.z+.71],[laser.x,.55,laser.z+.5]);
if(detector&&scope)cable([detector.x,.55,detector.z+.5],[scope.x+.59,.32,scope.z+.63]);
const ctx=$('#pattern').getContext('2d'),sc=screenCanvas.getContext('2d'),osc=scopeCanvas.getContext('2d');
for(const x of [ctx,sc,osc]){x.globalAlpha=1;x.fillStyle='#101d30';x.fillRect(0,0,x.canvas.width,x.canvas.height)}
for(let i=0;i<600;i++){const val=samples[i].intensity;for(const x of [ctx,sc]){x.fillStyle=hex;x.globalAlpha=Math.max(0,Math.min(1,val));x.fillRect(i/600*x.canvas.width,0,x.canvas.width/600+1,x.canvas.height)}}ctx.globalAlpha=sc.globalAlpha=1;screenTexture.needsUpdate=true;
osc.strokeStyle='#2b455c';osc.lineWidth=1;
for(let x=0;x<=600;x+=60){osc.beginPath();osc.moveTo(x,0);osc.lineTo(x,160);osc.stroke()}
for(let y=0;y<=160;y+=32){osc.beginPath();osc.moveTo(0,y);osc.lineTo(600,y);osc.stroke()}
if(detector){
osc.beginPath();osc.strokeStyle='#70ead0';osc.lineWidth=2;for(let i=0;i<600;i++){const yy=80-(m.waveform?(m.peak?samples[i].voltage/m.peak:0)*m.response.gain:0)*55;i?osc.lineTo(i,yy):osc.moveTo(i,yy)}osc.stroke();osc.font='16px monospace';osc.fillStyle='#a4e6dc';osc.fillText(m.waveform?`AC ${m.peak.toFixed(3)} Vpk | ${generator.frequency} kHz`:`DC ${m.response.voltage.toFixed(3)} V`,10,22);ctx.drawImage(scopeCanvas,0,0);}
else{osc.font='26px monospace';osc.fillStyle='#82a9c7';osc.fillText('NO INPUT',220,91);}
scopeTexture.needsUpdate=true;
const p=$('#plot').getContext('2d');p.fillStyle='#f6f9fd';p.fillRect(0,0,600,160);p.strokeStyle='#e0e7f0';p.lineWidth=1;for(let j=0;j<5;j++){p.beginPath();p.moveTo(0,15+j*30);p.lineTo(600,15+j*30);p.stroke()}
p.beginPath();p.strokeStyle='#467ce4';p.lineWidth=2;for(let i=0;i<600;i++){let value=samples[i].intensity;if(m.active==='polar')value=m.beforeLast*malus(i/599*180-m.previousAngle);if(m.active==='bandwidth')value=detector?1/Math.sqrt(1+(10**(i/599*6)/m.response.cutoff)**2):0;if(m.active==='detector')value=detector?i/599:0;const yy=140-value*115;i?p.lineTo(i,yy):p.moveTo(i,yy)}p.stroke();p.fillStyle='#8b9bb1';p.font='15px sans-serif';
p.fillText(m.active==='bandwidth'?'1 Hz                  1 kHz                 1 MHz':m.active==='detector'?'0                入射光功率                 1 mW':m.active==='polar'?'0°                  90°                 180°':`−${m.halfWindow*1000} mm                 0                 +${m.halfWindow*1000} mm`,8,159);
$('#metrics').innerHTML=m.metrics;$('#screen-sub').textContent=detector?(scope?'示波器 · 自动连接':'探测器输出'):receiver?`±${m.halfWindow*1000} mm · 相对强度`:'未接入接收端';$('#plot-sub').textContent=m.active==='bandwidth'?'幅频响应 · 对数频率':m.active==='detector'?'归一化光电流':m.active==='polar'?'角度扫描':'归一化强度';$('#connection-status').textContent=items.length?(receiver?`光路已接通 · ${experiments[m.active].name}`:'待对准 · 光束沿 +X 传播'):'空实验台 · 从仪器库开始';publishLearningState();
}
const caster=new THREE.Raycaster(),mouse=new THREE.Vector2(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.25);function pointer(e){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);caster.setFromCamera(mouse,camera)}renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer(e);const hit=caster.intersectObjects(groups,true)[0];if(hit){let g=hit.object;while(g.parent!==scene)g=g.parent;selected=g.userData.id;const p=new THREE.Vector3();caster.ray.intersectPlane(plane,p);drag={id:selected,offset:items.find(a=>a.id===selected).x-p.x,offsetZ:items.find(a=>a.id===selected).z-p.z};document.body.classList.remove('hide-inspector');$('#inspector-toggle').setAttribute('aria-expanded','true');controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);rebuild();inspect()}});renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;pointer(e);const p=new THREE.Vector3();if(caster.ray.intersectPlane(plane,p)){const a=items.find(a=>a.id===drag.id);a.x=Math.max(-6,Math.min(6,p.x+drag.offset));a.z=Math.max(-2.5,Math.min(2.5,p.z+drag.offsetZ));rebuild();inspect()}});function release(){drag=null;controls.enabled=true}renderer.domElement.addEventListener('pointerup',release);renderer.domElement.addEventListener('pointercancel',release);
$('#reset').onclick=()=>preset(mode);$('#top').onclick=()=>{camera.position.set(0,18,.01);controls.target.set(0,0,0)};$('#perspective').onclick=()=>{camera.position.set(12,12,15);controls.target.set(0,.7,0)};$('#toggle').onclick=()=>{playing=!playing;$('#toggle').textContent=playing?'⏸ 暂停光源':'▶ 开启光源';update()};let toastTimer;function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600)}$('#help').onclick=()=>toast('从空台开始添加仪器，沿 X / Z 自由拖动。光源沿 +X 传播，同轴器件自动连接；选择预设将重新搭台。');$('#save').onclick=()=>{localStorage.setItem('optilab-session',JSON.stringify({mode,items,wavelength,power}));toast('已保存到当前浏览器，点击「恢复实验」载入')};$('#export').onclick=()=>{const rows=['# OptiLab teaching simulation',...Object.entries(lastMeasurement).map(([k,v])=>'# '+k+','+v),'position_mm,relative_intensity,time_us,voltage_V',...samples.map(s=>`${s.position_mm},${s.intensity},${s.time_us},${s.voltage}`)];if(currentMeasurement.active==='polar'){rows.push('angle_deg,normalized_transmission');for(let i=0;i<=180;i++)rows.push(`${i},${currentMeasurement.beforeLast*malus(i-currentMeasurement.previousAngle)}`)}const url=URL.createObjectURL(new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`OptiLab-${mode}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('实验数据已导出为 CSV')};
const resize=new ResizeObserver(()=>{const el=$('#viewport');camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight)});resize.observe($('#viewport'));preset('free');
$('#restore').onclick=()=>{try{const saved=JSON.parse(localStorage.getItem('optilab-session'));if(!saved||!experiments[saved.mode]||!Array.isArray(saved.items)||!saved.items.every(a=>TYPES[a.type]&&Number.isFinite(a.x)&&Number.isFinite(a.z??0)))throw Error();preset(saved.mode);items=saved.items.map(a=>({...defaults,...a}));id=Math.max(0,...items.map(a=>a.id));wavelength=Math.max(380,Math.min(750,saved.wavelength||532));power=Math.max(0,Math.min(1,saved.power??1));selected=items[0]?.id??null;rebuild();inspect();toast('已恢复保存的实验')}catch{toast('没有可恢复的有效实验')}};
for(const [button,cls] of [['library-toggle','hide-library'],['inspector-toggle','hide-inspector'],['results-toggle','hide-results']]){const b=$('#'+button);b.onclick=()=>{document.body.classList.toggle(cls);b.setAttribute('aria-expanded',String(!document.body.classList.contains(cls)))}}
$('#focus').onclick=()=>{const on=document.body.classList.toggle('focus-mode');$('#focus').textContent=on?'退出专注':'专注场景';};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('当前容器不支持系统全屏，可使用「专注场景」铺满工作区')}};
document.addEventListener('fullscreenchange',()=>{$('#fullscreen').textContent=document.fullscreenElement?'退出全屏':'全屏 ⛶'});
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});



document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')){document.body.classList.remove('focus-mode');$('#focus').textContent='专注场景'}});

function publishLearningState(){if(!currentMeasurement)return;window.dispatchEvent(new CustomEvent('optilab:state',{detail:{experiment:mode,wavelength,power,playing,items:items.map(a=>({...a})),selected,measurement:{...currentMeasurement.metadata},receiverId:currentMeasurement.receiver?.id,laserId:currentMeasurement.laser?.id,opticalPathIds:currentMeasurement.optics.map(a=>a.id),peak:currentMeasurement.peak}}))}
window.addEventListener('optilab:select',e=>{if(experiments[e.detail?.experiment]){const saved=normalizeScene(e.detail.scene);preset(e.detail.experiment);if(saved&&saved.experiment===mode){items=saved.items;id=Math.max(0,...items.map(a=>a.id));selected=saved.selected;wavelength=saved.wavelength;power=saved.power;playing=saved.playing;$('#toggle').textContent=playing?'⏸ 暂停光源':'▶ 开启光源';rebuild();inspect()}}});
import('./learning.js').then(publishLearningState).catch(()=>toast('学习工作台未能加载，请刷新或检查服务器。'));
