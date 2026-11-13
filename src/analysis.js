export const methods={
raw:{name:'原始曲线（不拟合）',x:'自变量',y:'测量值'},linear:{name:'通用线性拟合',x:'自变量（自定单位）',y:'因变量（自定单位）'},lens:{name:'薄透镜 · 倒数线性拟合',x:'物距 u / cm',y:'像距 v / cm'},polar:{name:'偏振 · cos² 线性拟合',x:'检偏器角度 / °',y:'相对强度'},slit:{name:'双缝 · 亮纹级次拟合',x:'亮纹级次 m',y:'位置 / mm'},diffraction:{name:'单缝 · 暗纹级次拟合',x:'暗纹级次 m（非零）',y:'位置 / mm'},grating:{name:'光栅 · 正弦角度拟合',x:'衍射级次 m',y:'衍射角 / °'},detector:{name:'探测器 · 响应度拟合',x:'光功率 / mW',y:'电流 / μA'},bandwidth:{name:'接收机 · 一阶 RC 非线性拟合',x:'频率 / kHz',y:'交流幅值 / V'}
};
export function parseTable(text){
 if(typeof text!=='string'||text.length>2_000_000)throw Error('文件过大（上限 2 MB）');
 text=text.replace(/^\uFEFF/,'');
 const first=text.split(/\r?\n/).find(l=>l.trim()&&!l.trim().startsWith('#'));if(!first)throw Error('文件没有数据');
 const count=d=>{let quote=false,n=0;for(let i=0;i<first.length;i++){if(first[i]==='"')quote=!quote;else if(!quote&&first[i]===d)n++}return n};
 const delimiter=['\t',',',';','，'].sort((a,b)=>count(b)-count(a))[0];if(!count(delimiter))throw Error('请上传至少两列的 CSV 或 TSV 文件');
 let rows=[],row=[],field='',quoted=false,lineStart=true,comment=false;
 for(let i=0;i<=text.length;i++){let c=text[i]??'\n';if(lineStart&&c==='#'){comment=true}lineStart=false;if(comment){if(c==='\n'){comment=false;lineStart=true}continue}
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else if(!quoted&&field.trim()==='')quoted=true;else if(quoted)quoted=false;else field+=c;}
  else if(c===delimiter&&!quoted){row.push(field.trim());field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';lineStart=true;}
  else field+=c;
 }
 if(quoted)throw Error('CSV 引号未闭合');if(rows.length>5001)throw Error('最多导入 5000 行数据');
 const headers=rows.shift();if(headers.length<2||new Set(headers).size!==headers.length||headers.some(h=>!h))throw Error('表头须为至少两个非空且不重复的列名');
 if(!rows.length)throw Error('表格只有表头，没有测量数据');
 const wrong=rows.findIndex(r=>r.length!==headers.length);if(wrong!==-1)throw Error(`第 ${wrong+2} 行列数与表头不一致`);
 return {headers,rows};
}
export function regression(points){
 if(points.length<3)throw Error('拟合至少需要 3 个有效数据点');
 const n=points.length,mx=points.reduce((s,p)=>s+p.x,0)/n,my=points.reduce((s,p)=>s+p.y,0)/n;
 const xx=points.reduce((s,p)=>s+(p.x-mx)**2,0);if(xx<=Number.EPSILON*Math.max(1,n*mx*mx))throw Error('横轴没有足够变化，无法拟合');
 const slope=points.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/xx,intercept=my-slope*mx;
 const residuals=points.map(p=>p.y-(slope*p.x+intercept)),sse=residuals.reduce((s,r)=>s+r*r,0),sst=points.reduce((s,p)=>s+(p.y-my)**2,0),variance=sse/(n-2);
 return {slope,intercept,r2:sst>1e-20?1-sse/sst:null,rmse:Math.sqrt(sse/n),slopeSE:Math.sqrt(variance/xx),interceptSE:Math.sqrt(variance*(1/n+mx*mx/xx)),residuals,predicted:points.map(p=>slope*p.x+intercept)};
}
function bandwidthFit(points){
 const fs=points.map(p=>p.x);if(fs.some(x=>x<=0)||points.some(p=>p.y<0))throw Error('频率须大于零、幅度须非负');if(Math.min(...fs)===Math.max(...fs))throw Error('需要多个不同频率');if(points.every(p=>p.y===0))throw Error('幅度全部为零，无法估计带宽');
 const lo=Math.log10(Math.min(...fs))-3,hi=Math.log10(Math.max(...fs))+3;
 const evaluate=log=>{const fc=10**log,h=points.map(p=>1/Math.sqrt(1+(p.x/fc)**2)),amplitude=h.reduce((s,v,i)=>s+v*points[i].y,0)/h.reduce((s,v)=>s+v*v,0);return {fc,amplitude,predicted:h.map(v=>v*amplitude),sse:h.reduce((s,v,i)=>s+(v*amplitude-points[i].y)**2,0)}};
 let best={sse:Infinity},bestLog=lo;for(let i=0;i<=240;i++){const log=lo+(hi-lo)*i/240,r=evaluate(log);if(r.sse<best.sse){best=r;bestLog=log}}
 let left=Math.max(lo,bestLog-(hi-lo)/240),right=Math.min(hi,bestLog+(hi-lo)/240);for(let i=0;i<70;i++){const a=left+(right-left)/3,b=right-(right-left)/3;if(evaluate(a).sse<evaluate(b).sse)right=b;else left=a}best=evaluate((left+right)/2);
 const mean=points.reduce((s,p)=>s+p.y,0)/points.length,sst=points.reduce((s,p)=>s+(p.y-mean)**2,0);
 return {...best,r2:sst>1e-20?1-best.sse/sst:null,rmse:Math.sqrt(best.sse/points.length),residuals:points.map((p,i)=>p.y-best.predicted[i]),boundary:Math.abs(Math.log10(best.fc)-lo)<.02||Math.abs(Math.log10(best.fc)-hi)<.02,bracketed:best.fc>Math.min(...fs)&&best.fc<Math.max(...fs)};
}
export function analyzeTable(table,{xColumn=0,yColumn=1,method='linear',params={}}={}){
 if(!methods[method])throw Error('请选择有效分析模型');if(xColumn===yColumn)throw Error('横轴与纵轴不能选择同一列');
 if(!table.headers[xColumn]||!table.headers[yColumn])throw Error('数据列不存在');
 const invalid=[],original=[];table.rows.forEach((r,i)=>{const x=r[xColumn],y=r[yColumn];if(!String(x??'').trim()||!String(y??'').trim()||!Number.isFinite(Number(x))||!Number.isFinite(Number(y)))invalid.push(i+2);else original.push({x:Number(x),y:Number(y),row:i+2})});
 if(invalid.length)throw Error(`第 ${invalid.slice(0,10).join('、')} 行含空白或非数值，请修正后分析（不会静默删除）`);
 if(original.length<(method==='raw'?2:3))throw Error(method==='raw'?'至少需要 2 行数据':'拟合至少需要 3 行有效数据');
 let points=original.map(p=>({...p})),xLabel=methods[method].x,yLabel=methods[method].y;
 const positive=(value,name)=>{if(!Number.isFinite(Number(value))||Number(value)<=0)throw Error(name+'必须大于零');return Number(value)};
 if(method==='lens'){if(original.some(p=>p.x<=0||p.y===0||Math.abs(p.x+p.y)<1e-12))throw Error('物距应大于零，像距不可为零，u+v 不可为零');points=original.map(p=>({...p,x:1/p.x,y:1/p.y}));xLabel='1/u / cm⁻¹';yLabel='1/v / cm⁻¹'}
 if(method==='polar'){const offset=Number(params.offset??0);if(!Number.isFinite(offset))throw Error('偏振零点必须为数值');points=original.map(p=>({...p,x:Math.cos((p.x-offset)*Math.PI/180)**2}));xLabel='cos²(θ−θ₀)'}
 if(method==='grating'){if(original.some(p=>Math.abs(p.y)>=90))throw Error('衍射角须在 −90° 与 90° 之间');points=original.map(p=>({...p,y:Math.sin(p.y*Math.PI/180)}));yLabel='sin θ'}
 if(['slit','diffraction','grating'].includes(method)&&original.some(p=>!Number.isInteger(p.x)))throw Error('条纹或衍射级次必须为整数');
 if(method==='diffraction'&&original.some(p=>p.x===0))throw Error('单缝暗纹没有零级，请移除 m=0 的中心亮纹读数');
 if(method==='detector'&&original.some(p=>p.x<0))throw Error('入射光功率不可为负');
 const fit=method==='raw'?null:method==='bandwidth'?bandwidthFit(points):regression(points),warnings=[],derived=[];
 if(points.length<5)warnings.push('数据少于 5 组，建议增加测量并覆盖整个研究范围。');
 if(fit?.r2!==null&&fit?.r2<.95)warnings.push('拟合解释度偏低；检查数据、模型、单位和控制变量，不应自动删除偏离点。');
 if(method==='lens'){if(Math.abs(fit.intercept)<1e-12)warnings.push('截距接近零，不能可靠估计焦距。');else derived.push({label:'截距估计焦距',value:1/fit.intercept,unit:'cm'});derived.push({label:'逐组焦距均值',value:original.reduce((s,p)=>s+p.x*p.y/(p.x+p.y),0)/original.length,unit:'cm'});if(Math.abs(fit.slope+1)>.1)warnings.push('倒数拟合斜率明显偏离理论值 −1，请检查距离零点和近轴假设。')}
 if(['slit','diffraction'].includes(method)){const width=positive(method==='slit'?params.separation??.25:params.width??.1,method==='slit'?'双缝间距':'单缝宽度'),distance=positive(params.distance??.6,'缝屏距离');derived.push({label:'估计波长',value:Math.abs(fit.slope)*width/distance*1000,unit:'nm'});warnings.push('波长估计使用小角度远场近似；拟合标准误尚未包含缝宽/缝距和屏距的校准不确定度。')}
 if(method==='grating')derived.push({label:'估计波长',value:Math.abs(fit.slope)*1e6/positive(params.density??300,'光栅线密度'),unit:'nm'});
 if(method==='detector')derived.push({label:'光电响应度',value:fit.slope/1000,unit:'A/W'},{label:'电流零点截距',value:fit.intercept,unit:'μA'});
 if(method==='polar')derived.push({label:'最大调制强度 A',value:fit.slope,unit:''},{label:'背景截距 B',value:fit.intercept,unit:''});
 if(method==='bandwidth'){derived.push({label:'−3 dB 截止频率',value:fit.fc,unit:'kHz'},{label:'低频幅值 A₀',value:fit.amplitude,unit:'V'});if(!fit.bracketed||fit.boundary)warnings.push('测量频率未充分覆盖拟合截止点两侧，截止频率可能不可辨识，建议扩大扫频范围。');warnings.push('一阶 RC 非线性拟合未计算参数置信区间；需要重复测量或更完整的不确定度分析。')}
 if(fit?.rmse>0){const abnormal=fit.residuals.map((r,i)=>Math.abs(r)>3*fit.rmse?points[i].row:null).filter(Boolean);if(abnormal.length)warnings.push(`第 ${abnormal.join('、')} 行残差超过 3×RMSE，请复核原始记录；已保留参与拟合。`)}
 return {method,methodName:methods[method].name,n:points.length,xLabel,yLabel,points,original,fit,derived,warnings,params};
}
export function summarizeAnalysis(a){if(!a)return null;return {method:a.methodName,n:a.n,xLabel:a.xLabel,yLabel:a.yLabel,params:a.params,derived:a.derived,fit:a.fit?Object.fromEntries(Object.entries(a.fit).filter(([k])=>!['residuals','predicted'].includes(k))):null,warnings:a.warnings,observations:a.original.slice(0,100),truncated:a.n>100};}
export function reportChecks(text,analysis,source){
 const issues=[];if(/【请|待填写|TODO|TBD/i.test(text))issues.push('报告仍含待填写占位内容，请根据实际实验补充后再提交。');for(const [title,pattern] of [['实验目的',/目的|目标/],['实验原理',/原理|理论|公式/],['仪器与步骤',/仪器|步骤|方法/],['数据与图表',/数据|图表|曲线/],['误差分析',/误差|不确定度|残差/],['结论',/结论|总结/]])if(!pattern.test(text))issues.push('未识别到「'+title+'」相关内容，请补充或检查章节标题。');
 if(!analysis)issues.push('尚无已计算的数据结果，无法核对报告中的数值结论。');
 if(!/单位|cm|mm|nm|μA|mW|kHz|A\/W|V|Hz/.test(text))issues.push('未识别到常用单位，请为测量值、坐标轴和结果补充单位。');
 if(source!=='实测')issues.push(`当前数据来源为「${source||'未导入'}」，报告须明确标注，不得写成真实实测。`);
 if(analysis?.warnings?.length)issues.push(...analysis.warnings.map(w=>'数据提示：'+w));
 return issues.length?issues:['结构关键词检查通过。此检查不证明内容和结论正确，请继续核对数据及推导。'];
}
