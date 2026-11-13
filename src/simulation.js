import { TYPES, imageDistance, malus, doubleSlit, singleSlit, gratingIntensity, receiverResponse } from './physics.js';
export const defaults = {z:0,f:1.5,d:.25,angle:0,width:.1,density:300,slits:8,responsivity:.45,load:10,capacitance:100,frequency:100,depth:.8};
export function measure(items,{mode='free',wavelength=532,power=1,playing=true}={}) {
 const laser=items.filter(a=>a.type==='laser').sort((a,b)=>a.x-b.x)[0];
 const path=laser?items.filter(a=>!['laser','scope','generator'].includes(a.type)&&a.x>laser.x&&Math.abs(a.z-laser.z)<.15).sort((a,b)=>a.x-b.x):[];
 const receiver=path.find(a=>['screen','detector'].includes(a.type));
 const optics=receiver?path.slice(0,path.indexOf(receiver)+1):path;
 const find=t=>optics.find(a=>a.type===t),lens=find('lens'),slit=find('slit'),aperture=find('aperture'),grating=find('grating'),pol=optics.filter(a=>a.type==='polarizer');
 const detector=receiver?.type==='detector'?receiver:null,generator=items.find(a=>a.type==='generator'),scope=items.find(a=>a.type==='scope');
 let intensity=laser&&playing?power:0,angle=0,beforeLast=intensity,previousAngle=0;
 pol.forEach(a=>{beforeLast=intensity;previousAngle=angle;intensity*=malus(a.angle-angle);angle=a.angle});
 const active=mode==='free'?(detector?(generator?'bandwidth':'detector'):grating?'grating':aperture?'diffraction':slit?'slit':pol.length?'polar':lens?'lens':'free'):mode;
 const element=active==='grating'?grating:active==='diffraction'?aperture:slit;
 const L=element&&receiver?(receiver.x-element.x)*.1:0,lambda=wavelength*1e-9;
 const spacing=slit&&L>0?lambda*L/(slit.d*.001):0;
 const u=lens&&laser?lens.x-laser.x:0,v=lens?imageDistance(u,lens.f):0,screenDist=lens&&receiver?receiver.x-lens.x:0;
 const sigma=lens?Math.min(.9,.015+Math.abs(1-screenDist/v)*.28):.11;
 const halfWindow=active==='grating'?.2:.008;
 const response=receiverResponse(detector?intensity*.001:0,detector?.responsivity??.45,detector?.load??10,detector?.capacitance??100,generator?.frequency??100);
 const waveform=!!(detector&&scope&&generator);
 const peak=response.voltage*(generator?.depth??0)*response.gain;
 const samples=Array.from({length:600},(_,i)=>{const y=(i/599-.5)*halfWindow*2;let val=Math.exp(-2*(((i/599-.5)/sigma)**2));
 if(element&&L>0){if(active==='slit')val=doubleSlit(y,lambda,slit.d*.001,L);if(active==='diffraction')val=singleSlit(y,lambda,aperture.width*.001,L);if(active==='grating')val=gratingIntensity(y,lambda,1/(grating.density*1000),grating.slits,L);}
 return {position_mm:y*1000,intensity:receiver?val*intensity:0,time_us:i/599*2/(generator?.frequency??100)*1000,voltage:waveform?peak*Math.sin(i/599*4*Math.PI+response.phase):response.voltage};});
 let metrics=receiver?'接收端已对准':'请添加并对准观察屏或探测器';
 if(active==='lens')metrics=`理论像距<b>${lens?(Number.isFinite(v)?(v*10).toFixed(1)+' cm':'∞'):'—'}</b>实际屏距<b>${lens&&receiver?(screenDist*10).toFixed(1)+' cm':'—'}</b>`;
 if(active==='slit')metrics=`条纹间距<b>${spacing?(spacing*1000).toFixed(3)+' mm':'—'}</b>缝屏距<b>${(L*100).toFixed(1)} cm</b>`;
 if(active==='diffraction')metrics=`中央亮纹宽度<b>${aperture&&L>0?(2*lambda*L/(aperture.width*.001)*1000).toFixed(3)+' mm':'—'}</b>`;
 if(active==='grating')metrics=`一级衍射角<b>${grating&&lambda*grating.density*1000<=1?(Math.asin(lambda*grating.density*1000)*180/Math.PI).toFixed(2)+'°':'—'}</b>`;
 if(active==='polar')metrics=`透射强度 I / I₀<b>${intensity.toFixed(3)}</b>检偏器角度<b>${pol.at(-1)?.angle??0}°</b>`;
 if(active==='detector')metrics=`光电流<b>${detector?(response.current*1e6).toFixed(1)+' μA':'—'}</b>输出电压<b>${detector?response.voltage.toFixed(3)+' V':'—'}</b>`;
 if(active==='bandwidth')metrics=`截止频率<b>${detector?(response.cutoff/1000).toFixed(1)+' kHz':'—'}</b>交流峰值<b>${waveform?peak.toFixed(3)+' V':'—'}</b>相位<b>${(response.phase*180/Math.PI).toFixed(1)}°</b>`;
 return {laser,receiver,optics,lens,slit,aperture,grating,pol,detector,generator,scope,active,intensity,beforeLast,previousAngle,L,v,screenDist,halfWindow,response,waveform,peak,samples,metrics,metadata:{mode,active_model:active,wavelength_nm:wavelength,relative_intensity:intensity,receiver_aligned:!!receiver,fringe_spacing_mm:spacing*1000,image_distance_cm:v*10,screen_distance_cm:screenDist*10,photocurrent_A:detector?response.current:0,output_voltage_V:detector?response.voltage:0,cutoff_Hz:detector?response.cutoff:0}};
}
