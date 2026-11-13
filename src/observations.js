import {guides} from './curriculum.js';
export function captureObservation(scene,key){
 if(!scene||scene.experiment!==key)throw Error('当前三维场景与本实验不同，请在操作页重新搭建本实验。');
 const m=scene.measurement,items=scene.items,receiver=items.find(a=>a.id===scene.receiverId);
 if(!receiver||!m.receiver_aligned)throw Error('请先在三维场景中对准光源和接收端。');
 const path=items.filter(a=>scene.opticalPathIds?.includes(a.id));
 const laser=items.find(a=>a.id===scene.laserId),lens=path.find(a=>a.type==='lens'),polar=path.filter(a=>a.type==='polarizer').sort((a,b)=>a.x-b.x).at(-1),generator=items.find(a=>a.type==='generator');
 let row;
 if(key==='lens'&&lens&&laser)row=[(lens.x-laser.x)*10,(receiver.x-lens.x)*10];
 else if(key==='polar'&&polar)row=[polar.angle,m.relative_intensity];
 else if(key==='detector'&&receiver.type==='detector')row=[m.relative_intensity,m.photocurrent_A*1e6];
 else if(key==='bandwidth'&&receiver.type==='detector'&&generator)row=[generator.frequency,scene.peak];
 else if(['lens','polar','detector','bandwidth'].includes(key))throw Error('所需器件未接入当前光路，请检查同轴性和接收端类型。');
 else throw Error('该实验需在观测图样中判读级次和位置/角度。请按模板手动记录或上传实测表，不从理论值伪造测量。');
 if(row.some(v=>!Number.isFinite(v)))throw Error('仿真读数无效，请检查仪器参数。');
 return {row,headers:guides[key].columns,method:guides[key].method};
}
