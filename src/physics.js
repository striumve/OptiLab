export const TYPES={laser:{name:'半导体激光器',icon:'▰'},lens:{name:'凸透镜',icon:'◯'},slit:{name:'双缝器件',icon:'Ⅱ'},polarizer:{name:'偏振片',icon:'⊘'},screen:{name:'观察屏',icon:'▤'}};
export function imageDistance(u,f){return Math.abs(u-f)<1e-8?Infinity:f*u/(u-f)}
export function malus(angle){return Math.cos(angle*Math.PI/180)**2}
export function doubleSlit(y,wavelength,separation,distance){return Math.cos(Math.PI*separation*y/(wavelength*distance))**2}
export function traceRay(items,y,slope,end=5.5,start=-5.5){let x=start;const points=[[x,y]];for(const a of [...items].sort((a,b)=>a.x-b.x)){y+=(a.x-x)*slope;x=a.x;points.push([x,y]);if(a.type==='lens')slope-=y/a.f;if(a.type==='screen')return points;}points.push([end,y+(end-x)*slope]);return points;}


export function sinc(x){return Math.abs(x)<1e-10?1:Math.sin(x)/x}
export function singleSlit(y,lambda,width,L){return sinc(Math.PI*width*Math.sin(Math.atan2(y,L))/lambda)**2}
export function gratingIntensity(y,lambda,period,count,L){const sine=Math.sin(Math.atan2(y,L)),beta=Math.PI*period*sine/lambda;const interference=Math.abs(Math.sin(beta))<1e-10?1:(Math.sin(count*beta)/(count*Math.sin(beta)))**2;return interference*sinc(beta*.25)**2}
// load in kΩ, capacitance in pF, frequency in kHz
export function receiverResponse(power,responsivity,load,capacitance,frequency){const R=load*1000,C=capacitance*1e-12,cutoff=1/(2*Math.PI*R*C),ratio=frequency*1000/cutoff;return {current:power*responsivity,voltage:power*responsivity*R,cutoff,gain:1/Math.sqrt(1+ratio*ratio),phase:-Math.atan(ratio)}}
Object.assign(TYPES,{aperture:{name:'可调单缝',icon:'▯'},grating:{name:'透射光栅',icon:'▥'},detector:{name:'光电探测器',icon:'◧'},generator:{name:'信号发生器',icon:'∿'},scope:{name:'数字示波器',icon:'⌁'}});
