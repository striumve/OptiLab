import {experiments} from './experiments.js';
import {TYPES} from './physics.js';
import {defaults} from './simulation.js';
import {methods,parseTable,analyzeTable} from './analysis.js';
export function normalizeScene(value){
 if(!value||!experiments[value.experiment]||!Array.isArray(value.items)||value.items.length>64)return null;
 const keys=Object.keys(defaults),ids=new Set(),items=[];
 for(const item of value.items){if(!TYPES[item?.type]||!Number.isInteger(item.id)||ids.has(item.id)||!Number.isFinite(item.x)||!Number.isFinite(item.z)||Math.abs(item.x)>6||Math.abs(item.z)>2.5)return null;
 const a={...defaults,type:item.type,id:item.id,x:item.x};for(const k of keys){const v=item[k]??defaults[k];if(!Number.isFinite(v))return null;a[k]=v}if(a.f<=0||a.d<=0||a.width<=0||a.density<=0||a.load<=0||a.capacitance<=0||a.frequency<=0||a.slits<2||!Number.isInteger(a.slits))return null;ids.add(a.id);items.push(a)}
 return {experiment:value.experiment,items,selected:ids.has(value.selected)?value.selected:null,wavelength:Number.isFinite(value.wavelength)?Math.max(380,Math.min(750,value.wavelength)):532,power:Number.isFinite(value.power)?Math.max(0,Math.min(1,value.power)):1,playing:value.playing!==false};
}
export function normalizeBook(value){
 if(!value||!experiments[value.experiment]||typeof value.report!=='string'||typeof value.csv!=='string'||!Array.isArray(value.chat)||!Array.isArray(value.checks))throw Error('实验备份记录格式无效');
 const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
 const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:new Date().toISOString();
 if(value.csv.length>2_000_000)throw Error('备份数据表超过 2 MB');
 const method=methods[value.config?.method]?value.config.method:'linear',params={};
 for(const key of ['offset','distance','separation','width','density'])if(value.config?.params?.[key]!==undefined){const v=Number(value.config.params[key]);if(Number.isFinite(v))params[key]=v}
 const config={method,xColumn:Number.isInteger(value.config?.xColumn)?value.config.xColumn:0,yColumn:Number.isInteger(value.config?.yColumn)?value.config.yColumn:1,params};
 const analysis=value.csv&&value.analysis?analyzeTable(parseTable(value.csv),config):null;
 return {id:text(value.id,80),experiment:value.experiment,created:timestamp(value.created),updated:timestamp(value.updated),preparation:text(value.preparation,40000),prepProvider:text(value.prepProvider,200),prepared:!!value.prepared,checks:value.checks.slice(0,12).map(Boolean),notes:text(value.notes,20000),csv:value.csv,source:['实测','仿真','示例'].includes(value.source)?value.source:'',config,analysis,report:text(value.report,30000),reviewed:!!value.reviewed,chat:value.chat.filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-100).map(m=>({role:m.role,text:m.text.slice(0,16000),provider:text(m.provider,200)})),interpretation:text(value.interpretation,40000),interpretProvider:text(value.interpretProvider,200),review:text(value.review,40000),reviewProvider:text(value.reviewProvider,200),scene:normalizeScene(value.scene)};
}
