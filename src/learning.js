import {renderRichText,renderMessageContent} from './rich-text.js';
import {requestAI} from './assistant-client.js';
import 'katex/dist/katex.min.css';
import './rich-text.css';
import {experiments} from './experiments.js';
import {TYPES} from './physics.js';
import {guides,instrumentGuides,preparationText,localAnswer} from './curriculum.js';
import {parseTable,analyzeTable,methods,summarizeAnalysis,reportChecks} from './analysis.js';
import {normalizeBook,normalizeScene} from './notebooks.js';
import {captureObservation} from './observations.js';
import {mountAISettings} from './ai-settings.js';
import './learning.css';
const $=s=>document.querySelector(s),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='optilab-notebooks-v2';let books=[],active=null,page='home',status={configured:false},scene=null,alert='',pending=new Map();
try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(value))books=value.slice(0,30).flatMap(b=>{try{return [normalizeBook(b)]}catch{return []}})}catch{}
function current(){return books.find(b=>b.id===active)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(books));$('#study-save-status').textContent='已保存到此浏览器';return true}catch{$('#study-save-status').textContent='存储空间不足，请导出备份';setStudyAlert('浏览器无法保存，请导出实验备份以免丢失。');return false}}
function update(fields,b=current()){if(!b)return;Object.assign(b,fields,{updated:new Date().toISOString()});save()}
function download(name,content,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const shell=document.createElement('section');shell.id='study';shell.className='study-overlay';shell.hidden=true;shell.setAttribute('aria-label','实验学习工作台');shell.innerHTML=`<header class="study-header"><button type="button" id="study-brand" aria-label="返回 OptiLab 首页">OptiLab</button><div id="study-heading"></div><div class="study-header-actions"><span id="ai-state"></span><button id="study-settings">应用设置</button><button id="study-settings-back" type="button" hidden>← 返回</button><button id="study-close" class="primary lab-entry">进入三维实验室 ↗</button></div></header><div class="study-layout"><aside class="study-nav"><button id="study-home">＋ 选择 / 新建实验</button><div class="study-eyebrow">我的实验记录</div><div id="notebook-list"></div><div class="study-nav-bottom"><button id="backup">导出实验备份</button><label class="file-button">导入备份<input id="backup-import" type="file" accept=".json"></label><span id="study-save-status">保存在此浏览器</span></div></aside><main class="study-main"><nav id="study-tabs" aria-label="实验阶段"></nav><div id="study-scroll"><div id="study-mobile-controls"></div><div id="study-content"></div></div></main></div><div id="study-alert" hidden><span id="study-alert-message" role="status"></span><button id="dismiss-study-alert" type="button" aria-label="关闭通知">×</button></div>`;document.body.append(shell);
function setOpen(on){shell.hidden=!on;$('#app').inert=on;if(!on){document.body.classList.remove('hide-library','hide-results','focus-mode');$('#results-toggle').setAttribute('aria-expanded','true');$('#library-toggle').setAttribute('aria-expanded','true');$('.sidebar details').open=true;$('#focus').textContent='专注场景';renderBenchChat()}}

const open=document.createElement('button');open.id='learning-open';open.textContent='✦ 学习工作台';open.onclick=()=>{setOpen(true);render()};$('.header-actions').prepend(open);
const aiText=(text,provider)=>`<div class="answer-source">${escape(provider||'内置实验指导 · 非 AI 生成')}</div><div class="ai-text rich-text">${renderRichText(text)}</div>`;
const card=(title,content,cls='')=>`<section class="study-card ${cls}"><h3>${title}</h3>${content}</section>`;
const list=arr=>`<ul>${arr.map(x=>`<li>${escape(x)}</li>`).join('')}</ul>`;
const tabs=[['prepare','01 预习与答疑'],['operate','02 操作与记录'],['data','03 数据分析'],['report','04 报告检查']];
function notebookName(book){return book.name||experiments[book.experiment].name}
const STUDY_ALERT_DURATION_MS=6000;
let studyAlertTimer;
function showStudyAlert(restart=false){
 const notification=$('#study-alert');
 const message=$('#study-alert-message');
 if(!restart&&notification.hidden===!alert&&(!alert||message.textContent===alert))return;
 clearTimeout(studyAlertTimer);
 if(alert&&message.textContent!==alert)message.textContent=alert;
 notification.hidden=!alert;
 notification.inert=!alert;
 if(alert)studyAlertTimer=setTimeout(dismissStudyAlert,STUDY_ALERT_DURATION_MS);
}
function dismissStudyAlert(){
 alert='';
 showStudyAlert();
}
function setStudyAlert(message){
 alert=message;
 showStudyAlert(true);
}
$('#dismiss-study-alert').onclick=dismissStudyAlert;
function renameNotebook(book){
 const name=prompt('输入实验记录的新名称（最多 80 字）',notebookName(book))?.trim();
 if(name===undefined||name===notebookName(book))return;
 if(!name||name.length>80){setStudyAlert('请输入 1 到 80 字的实验记录名称。');return}
 const previous={name:book.name,updated:book.updated};
 Object.assign(book,{name,updated:new Date().toISOString()});
 if(save())setStudyAlert('实验记录名称已更新。');else Object.assign(book,previous);
 render();
}
function deleteNotebook(book){
 if(!confirm('删除「'+notebookName(book)+'」及其本地实验数据？此操作无法撤销。'))return;
 const previous=books;
 books=books.filter(item=>item!==book);
 if(!save()){books=previous;return}
 if(active===book.id){active=null;page='home'}
 setStudyAlert('实验记录已删除。');
 render();
}
let renderedPage,renderedBook,settingsOrigin;
function render(){
 shell.classList.toggle('study-landing',page==='home');
 const inSettings=page==='settings';
 $('#study-settings').hidden=inSettings;
 $('#study-settings-back').hidden=!inSettings;
 $('#study-settings-back').textContent=settingsOrigin?.inLab?'← 返回实验台':'← 返回';
 if(page!==renderedPage||active!==renderedBook)$('#study-scroll').scrollTop=0;
 renderedPage=page;
 renderedBook=active;
 $('#ai-state').textContent=status.configured?'● AI 已配置':'○ 内置指导模式';$('#ai-state').className=status.configured?'ai-ready':'';
 $('#notebook-list').innerHTML=books.map(b=>`<div class="notebook-entry"><button class="notebook ${active===b.id?'active':''}" data-book="${escape(b.id)}"><b>${escape(notebookName(b))}</b><small>${escape(new Date(b.created).toLocaleString('zh-CN',{hour12:false}))} · ${escape(b.source||'未导入数据')}</small></button><div class="notebook-actions"><button data-rename-book="${escape(b.id)}" aria-label="重命名 ${escape(notebookName(b))}">重命名</button><button data-delete-book="${escape(b.id)}" aria-label="删除 ${escape(notebookName(b))}">删除</button></div></div>`).join('')||'<p class="study-muted">还没有实验记录。选择一个实验开始。</p>';
 document.querySelectorAll('[data-book]').forEach(el=>el.onclick=()=>{active=el.dataset.book;page='prepare';alert='';const selectedBook=current();window.dispatchEvent(new CustomEvent('optilab:select',{detail:{experiment:selectedBook.experiment,scene:selectedBook.scene}}));render()});
 for(const el of document.querySelectorAll('[data-rename-book]'))el.onclick=()=>renameNotebook(books.find(book=>book.id===el.dataset.renameBook));
 for(const el of document.querySelectorAll('[data-delete-book]'))el.onclick=()=>deleteNotebook(books.find(book=>book.id===el.dataset.deleteBook));
 const b=current();
 const notebook=b&&!['home','courses','settings'].includes(page);
 const title=page==='settings'?'应用设置':page==='courses'?'选择实验':notebook?notebookName(b):'';
 $('#study-heading').innerHTML=title?`<h1 title="${escape(title)}">${escape(title)}</h1>${notebook?`<p>${progress(b)}</p>`:''}`:'';
 $('#study-tabs').innerHTML=notebook?tabs.map(([key,name])=>`<button class="${page===key?'active':''}" data-page="${key}" ${page===key?'aria-current="step"':''}>${name}</button>`).join(''):'';
 document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>{page=el.dataset.page;alert='';render()});
 showStudyAlert();
 const mobileControls=$('#study-mobile-controls');
 mobileControls.replaceChildren();
 if(page!=='home'){const nav=document.createElement('div');nav.className='mobile-study-nav';nav.innerHTML='<button id="mobile-home">＋ 新实验</button><select id="mobile-books" aria-label="切换实验记录"><option value="">我的实验记录</option>'+books.map(book=>'<option value="'+escape(book.id)+'" '+(active===book.id?'selected':'')+'>'+escape(notebookName(book))+'</option>').join('')+'</select><button id="mobile-settings">应用设置</button>';mobileControls.append(nav);if(notebook){const actions=document.createElement('div');actions.className='notebook-actions mobile-notebook-actions';actions.innerHTML='<button type="button">重命名当前记录</button><button type="button">删除当前记录</button>';nav.after(actions);actions.children[0].onclick=()=>renameNotebook(b);actions.children[1].onclick=()=>deleteNotebook(b)}$('#mobile-home').onclick=showCourses;$('#mobile-settings').hidden=inSettings;$('#mobile-settings').onclick=showSettings;$('#mobile-books').onchange=e=>{if(!e.target.value)return;active=e.target.value;page='prepare';const book=current();window.dispatchEvent(new CustomEvent('optilab:select',{detail:{experiment:book.experiment,scene:book.scene}}));render()}}
 const content=$('#study-content');
 if(page==='home'){
  content.innerHTML=`<section class="landing-hero">
   <div class="landing-copy">
    <h1>OptiLab</h1>
    <p class="landing-subtitle">光电虚拟实验室</p>
    <p>在三维实验台搭建光路，观察仪器读数随参数变化，再用实验数据验证原理。</p>
    <div class="landing-actions">
     <button type="button" id="choose-experiment" class="primary lab-entry">选择实验 →</button>
     <button type="button" id="landing-enter-lab" class="lab-entry">进入三维实验室 ↗</button>
    </div>
   </div>
  </section>
  <section class="landing-workflow" aria-label="学习流程">
   <div><h2>预习原理</h2><p>查看实验指导，向 AI 助教提问。</p></div>
   <div><h2>搭建与观测</h2><p>移动器件、调节参数，记录仿真读数。</p></div>
   <div><h2>分析与报告</h2><p>导入数据、拟合曲线，检查实验报告。</p></div>
  </section>`;
  $('#choose-experiment').onclick=showCourses;
  $('#landing-enter-lab').onclick=()=>setOpen(false);
  return;
 }
 if(page==='courses'){content.innerHTML=`<div class="course-grid">${Object.entries(experiments).filter(([k])=>k!=='free').map(([k,e])=>`<button class="course-card" data-course="${k}"><span class="course-icon">${e.icon}</span><small>${e.en}</small><h2>${e.name}</h2><p>${escape(guides[k].objectives[0])}</p><span>开始实验 · 自动准备预习 →</span></button>`).join('')}<button class="course-card" data-course="free"><span class="course-icon">＋</span><small>OPEN EXPLORATION</small><h2>自由研究</h2><p>从空实验台开始，设计你自己的实验。</p><span>开始自由搭建 →</span></button></div>`;document.querySelectorAll('[data-course]').forEach(el=>el.onclick=()=>createBook(el.dataset.course));return;}
 if(page==='settings'){mountAISettings(content,status,{onSaved:value=>{status=value;$('#ai-state').textContent=value.configured?'● AI 已配置':'○ 内置指导模式';$('#ai-state').className=value.configured?'ai-ready':'';renderBenchChat()}});return;}
 if(!b){page='home';render();return;}
 if(page==='prepare')renderPrepare(b);if(page==='operate')renderOperate(b);if(page==='data')renderData(b);if(page==='report')renderReport(b);
}
function showCourses(){page='courses';dismissStudyAlert();render();}
function progress(b){return `${b.prepared?'预习已确认':'待预习'}　/　${b.checks.filter(Boolean).length}/${guides[b.experiment].procedure.length} 项操作　/　${b.analysis?'已分析 '+b.analysis.n+' 组数据':'待数据分析'}　/　${b.reviewed?'报告已自查':'报告草稿'}`}
async function refreshStatus(){try{const r=await fetch('/api/status');if(!r.ok)throw Error();status=await r.json()}catch{status={configured:false};setStudyAlert('无法连接后端，请使用 npm run dev 启动完整应用。')}}
async function createBook(key){if(books.length>=30){setStudyAlert('最多保存 30 本实验记录。请先导出备份；可在报告页删除不需要的记录。');render();return}const b={id:crypto.randomUUID(),experiment:key,created:new Date().toISOString(),updated:new Date().toISOString(),preparation:preparationText(key),prepProvider:'内置实验指导 · 非 AI 生成',chat:[],checks:[],notes:'',csv:'',source:'',config:{method:guides[key].method,xColumn:0,yColumn:1,params:{}},analysis:null,report:'',interpretation:'',review:'',prepared:false,reviewed:false};books.unshift(b);active=b.id;page='prepare';alert='';save();window.dispatchEvent(new CustomEvent('optilab:select',{detail:{experiment:key}}));if(status.configured)await assist('prepare','请为这项实验生成本科生预习内容。',b);else render();}
async function assist(task,message,b=current()){
 if(!b)return;const contextVersion=JSON.stringify({report:b.report,analysis:summarizeAnalysis(b.analysis),source:b.source});const token=b.id+':'+task;if(pending.has(token))return;
 const draft={text:'',frame:0};pending.set(token,draft);alert='';render();
 try{const result=await requestAI('/api/assist',{task,experiment:b.experiment,message,history:task==='chat'?b.chat.slice(0,-1).filter(m=>m.provider!=='内置资料检索').slice(-8).map(m=>({role:m.role,content:m.text})):[],scene:task!=='review'&&scene?.experiment===b.experiment?scene:null,analysis:summarizeAnalysis(b.analysis),dataSource:b.source||'尚无数据'},text=>{
  queuePreview(draft,text,()=>pending.get(token)===draft&&active===b.id?document.querySelector(`#study-content [data-ai-preview="${task}"]`):null);
 });if(['review','interpret'].includes(task)&&contextVersion!==JSON.stringify({report:b.report,analysis:summarizeAnalysis(b.analysis),source:b.source})){throw Error('请求期间报告或数据已修改，请根据最新内容重新生成。')}const provider=`${result.provider} · ${result.model}${result.incomplete?' · 回答可能未完成':''}`;
 if(task==='prepare'&&result.fallback==='output_limit'){
  if(active===b.id)setStudyAlert('本次 AI 预习未生成完整，已保留当前预习内容。');
  return;
 }
 if(task==='review'&&result.fallback){
  if(active===b.id)setStudyAlert(result.fallback==='timeout'
   ?'AI 报告检查重试后仍超时，可先查看「结构与数据自查」。'
   :'AI 报告检查未生成正文，可先查看「结构与数据自查」。');
  return;
 }
 if(task==='prepare')update({preparation:result.answer,prepProvider:provider,prepared:false},b);
 if(task==='chat')update({chat:[...b.chat,{role:'assistant',text:result.answer,provider}]},b);
 if(task==='interpret')update({interpretation:result.answer,interpretProvider:provider},b);
 if(task==='review')update({review:result.answer,reviewProvider:provider},b);
 }catch(e){if(active===b.id)setStudyAlert(e.message);}finally{pending.delete(token);if(active===b.id&&page!=='settings')render()}
}
function busy(task,b){return pending.has(b.id+':'+task)}
function aiLoading(title, detail=''){
 return `<div class="ai-loading${detail?' ai-loading-prominent':''}" role="status"><span class="ai-spinner" aria-hidden="true"></span><div><strong>${title}</strong>${detail?`<span>${detail}</span>`: ''}</div></div>`;
}
const streamLabels={
 prepare:['AI 正在生成预习内容','正文会随生成进度显示。你也可以先进入实验室，或展开下方参考。'],
 chat:['AI 正在回答'],
 interpret:['AI 正在解读实验结果'],
 review:['AI 正在检查报告']
};
function streamPreview(task,draft){
 return draft?`<div class="ai-preview" data-ai-preview="${task}">${aiLoading(...streamLabels[task])}<div class="ai-text rich-text" aria-live="off" ${draft.text?'':'hidden'}>${renderRichText(draft.text)}</div></div>`:'';
}
function queuePreview(draft,text,findPreview){
 draft.text=text;
 if(draft.frame)return;
 draft.frame=requestAnimationFrame(()=>{
  draft.frame=0;
  const preview=findPreview();
  if(!preview)return;
  const scroller=preview.closest('.chat-log, #bench-chat-messages');
  const follow=scroller&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<32;
  const content=preview.querySelector('.ai-text');
  content.innerHTML=renderRichText(draft.text);
  content.hidden=!draft.text;
  if(follow)scroller.scrollTop=scroller.scrollHeight;
 });
}
function studyPreview(task,b){return streamPreview(task,pending.get(b.id+':'+task))}
function preparationPanel(b){
 const generating=busy('prepare',b);
 const builtIn=b.prepProvider==='内置实验指导 · 非 AI 生成';
 const current=aiText(b.preparation,b.prepProvider);
 const action=generating?'正在生成…':!status.configured?'生成 AI 预习（需配置）':builtIn?'生成 AI 预习':'重新生成 AI 预习';
 const content=generating
  ? studyPreview('prepare',b)
    + `<details class="prep-reference"><summary>${builtIn?'查看内置参考（等待期间可读）':'查看上次生成的预习'}</summary>${current}</details>`
  : current;
 const controls=`<div class="card-actions"><button id="generate-prep" ${generating?'disabled':''}>${action}</button><label><input id="prepared" type="checkbox" ${b.prepared?'checked':''} ${generating?'disabled':''}> 我已阅读并完成自测</label></div>`;
 return generating?content+controls:controls+content;
}
function renderPrepare(b){const g=guides[b.experiment];$('#study-content').innerHTML=`<div class="study-two-col"><div>${card('预习内容',preparationPanel(b))}</div><div>${card('向实验助教提问',`<p class="study-muted">AI 会结合本实验、当前场景及已计算数据回答。未配置时可查询内置资料。</p><div class="quick-questions"><button data-q="请解释本实验的原理和公式。">解释原理</button><button data-q="这项实验应如何操作？">操作步骤</button><button data-q="可能有哪些误差，怎么验证？">误差来源</button></div><div class="chat-log">${b.chat.map(m=>`<article class="chat-message ${m.role}"><small>${m.role==='user'?'我的问题':escape(m.provider)}</small>${renderMessageContent(m)}</article>`).join('')||'<p class="study-muted">从一个不理解的概念开始。</p>'}${studyPreview('chat',b)}</div><form id="chat-form"><label for="chat-question">你的问题</label><textarea id="chat-question" maxlength="3000" placeholder="例如：为什么不能只测截止频率以下的数据？" required></textarea><div class="card-actions"><button type="button" id="local-answer">查内置资料</button><button class="primary" ${busy('chat',b)?'disabled':''}>${busy('chat',b)?'回答中…':'发送给 AI'}</button></div></form>`) +card('思考一下',`<p>${escape(g.question)}</p><details><summary>查看参考答案</summary><p>${escape(g.answer)}</p></details>`)}</div></div>`;
 $('#generate-prep').onclick=()=>assist('prepare','生成本实验的预习指导，并给出自测题。',b);$('#prepared').onchange=e=>{update({prepared:e.target.checked},b);$('#study-heading p').textContent=progress(b)};
 const ask=(q,local=false)=>{if(!q.trim())return;if(busy('chat',b))return;update({chat:[...b.chat,{role:'user',text:q,provider:'学生'}]},b);if(local){update({chat:[...b.chat,{role:'assistant',text:localAnswer(b.experiment,q),provider:'内置资料检索'}]},b);render()}else assist('chat',q,b)};
 $('#chat-form').onsubmit=e=>{e.preventDefault();ask($('#chat-question').value)};$('#local-answer').onclick=()=>ask($('#chat-question').value,true);document.querySelectorAll('[data-q]').forEach(el=>el.onclick=()=>ask(el.dataset.q,!status.configured));$('.chat-log')?.scrollTo(0,999999);
}
function renderOperate(b){const g=guides[b.experiment];$('#study-content').innerHTML=`<div class="study-two-col"><div>${card('实验操作清单',`<p class="study-muted">按实际完成情况逐项确认，不能以仿真过程替代真实实验记录。</p>${g.procedure.map((p,i)=>`<label class="check-step"><input type="checkbox" data-step="${i}" ${b.checks[i]?'checked':''}><span><small>STEP ${String(i+1).padStart(2,'0')}</small>${escape(p)}</span></label>`).join('')}<div class="card-actions"><button class="primary lab-entry" id="go-scene">进入三维实验室 ↗</button><button id="reload-preset">重新搭建本实验预设</button></div><p class="study-muted">进入场景保留当前布置；重新搭建将替换台面器件。</p>`) +card('操作笔记',`<label for="lab-notes">记录仪器参数、观察、异常和处理方法</label><textarea id="lab-notes" rows="8" maxlength="20000" placeholder="例如：调节检偏器至 90°，读数未归零，随后测量背景…">${escape(b.notes)}</textarea>`)}</div><div>${card('仪器使用与注意事项',`<label for="manual-select">选择仪器</label><select id="manual-select">${Object.entries(TYPES).map(([k,t])=>`<option value="${k}">${t.name}</option>`).join('')}</select><div id="manual-content"></div>`) +card('实验记录提醒',list(g.errors))}</div></div>`;
 document.querySelectorAll('[data-step]').forEach(el=>el.onchange=()=>{const checks=[...b.checks];checks[+el.dataset.step]=el.checked;update({checks},b);$('#study-heading p').textContent=progress(b)});$('#lab-notes').oninput=e=>update({notes:e.target.value},b);
 $('#go-scene').onclick=()=>{setOpen(false)};$('#reload-preset').onclick=()=>{window.dispatchEvent(new CustomEvent('optilab:select',{detail:{experiment:b.experiment}}));setOpen(false)};
 const manual=()=>{const key=$('#manual-select').value,m=instrumentGuides[key];$('#manual-content').innerHTML=`<h4>如何使用</h4><p>${escape(m.use)}</p><h4>注意事项</h4><p>${escape(m.care)}</p>`};const available=scene?.items?.find(a=>a.id===scene.selected)?.type||experiments[b.experiment].setup[0]?.[0]||'laser';$('#manual-select').value=available;$('#manual-select').onchange=manual;manual();
}
function loadCSV(text,source,b){const table=parseTable(text);update({csv:text,source,analysis:null,interpretation:'',review:'',reviewed:false,config:{...b.config,xColumn:0,yColumn:1}},b);return table}
function paramsHTML(b){const m=b.config.method,p=b.config.params||{};let fields=[];if(['slit','diffraction'].includes(m))fields.push(['distance','缝屏距离 L / m',p.distance??.6],m==='slit'?['separation','双缝间距 d / mm',p.separation??.25]:['width','单缝宽度 a / mm',p.width??.1]);if(m==='grating')fields.push(['density','光栅线密度 / 线·mm⁻¹',p.density??300]);if(m==='polar')fields.push(['offset','前置偏振方向 θ₀ / °',p.offset??0]);return fields.map(([key,label,value])=>`<label>${label}<input type="number" step="any" data-param="${key}" value="${escape(value)}"></label>`).join('')}
function renderData(b){let table;try{if(b.csv)table=parseTable(b.csv)}catch(e){setStudyAlert(e.message)}const a=b.analysis;$('#study-content').innerHTML=card('导入与整理数据',`<div class="data-actions"><label class="file-button primary">上传 CSV / TSV<input id="data-file" type="file" accept=".csv,.tsv,.txt"></label><button id="paste-toggle">粘贴数据</button><button id="data-template">下载本实验模板</button><button id="sample-data">加载示例数据</button><button id="record-scene">采集当前仿真读数</button></div><p class="study-muted">文件保存在当前浏览器中，最多 5000 行 / 2 MB。上传后请确认列、单位与数据来源。空白和非数值将明确报错。</p><div id="paste-area" hidden><textarea id="csv-paste" rows="6" placeholder="首行为表头，例如 u_cm,v_cm"></textarea><button id="apply-paste">导入粘贴内容（实测）</button></div><label>数据来源<select id="data-source"><option value="">尚无数据</option>${['实测','仿真','示例'].map(s=>`<option ${b.source===s?'selected':''}>${s}</option>`).join('')}</select></label>${table?`<div class="table-preview"><table><thead><tr>${table.headers.map(h=>`<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.slice(0,8).map(r=>`<tr>${r.map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="study-muted">共 ${table.rows.length} 行，预览前 8 行。来源：${escape(b.source)}</p>`:'<div class="data-empty">上传你的实验记录，或加载示例了解分析流程。</div>'}`)+
 card('计算模型与列映射',`<div class="model-fields"><label>分析方法<select id="analysis-method">${Object.entries(methods).map(([k,m])=>`<option value="${k}" ${b.config.method===k?'selected':''}>${m.name}</option>`).join('')}</select></label><label>横轴列 · ${escape(methods[b.config.method].x)}<select id="x-column">${table?table.headers.map((h,i)=>`<option value="${i}" ${b.config.xColumn===i?'selected':''}>${escape(h)}</option>`).join(''):'<option>请先导入数据</option>'}</select></label><label>纵轴列 · ${escape(methods[b.config.method].y)}<select id="y-column">${table?table.headers.map((h,i)=>`<option value="${i}" ${b.config.yColumn===i?'selected':''}>${escape(h)}</option>`).join(''):'<option>请先导入数据</option>'}</select></label>${paramsHTML(b)}</div><p class="study-muted">列中的数值必须符合上方单位约定。薄透镜、偏振、光栅会显示变换坐标；不会自动猜测或换算列名中的单位。</p><button class="primary" id="run-analysis" ${table?'':'disabled'}>计算并绘图</button>`)+
 (a?renderAnalysis(a,b):'')+card('结果解读与误差建议',`<button id="interpret" ${!a||busy('interpret',b)?'disabled':''}>${busy('interpret',b)?'AI 正在解读…':'请 AI 解读当前结果'}</button>${busy('interpret',b)?studyPreview('interpret',b):b.interpretation?aiText(b.interpretation,b.interpretProvider):'<p class="study-muted">先完成计算，再请求 AI。无 AI 时，下方数据提示和内置误差指导仍可使用。</p>'}${list(guides[b.experiment].errors)}`);
 $('#analysis-method').onchange=e=>{update({config:{...b.config,method:e.target.value},analysis:null,interpretation:'',review:'',reviewed:false},b);render()};
 for(const [id,key]of [['x-column','xColumn'],['y-column','yColumn']])$('#'+id).onchange=e=>invalidateConfig(b,{[key]:+e.target.value});
 document.querySelectorAll('[data-param]').forEach(el=>el.onchange=()=>invalidateConfig(b,{params:{...b.config.params,[el.dataset.param]:el.value}}));
 $('#data-source').onchange=e=>{update({source:e.target.value,interpretation:'',review:'',reviewed:false},b);render()};$('#paste-toggle').onclick=()=>{$('#paste-area').hidden=!$('#paste-area').hidden};
 const importText=(text,source)=>{try{loadCSV(text,source,b);alert='';render()}catch(e){setStudyAlert(e.message);render()}};
 $('#data-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>2_000_000){setStudyAlert('文件超过 2 MB，请先精简数据。');render();return}importText(await file.text(),'实测')};$('#apply-paste').onclick=()=>importText($('#csv-paste').value,'实测');$('#data-template').onclick=()=>download(`${b.experiment}-template.csv`,guides[b.experiment].columns.join(',')+'\n','text/csv;charset=utf-8');$('#sample-data').onclick=()=>{update({config:{method:guides[b.experiment].method,xColumn:0,yColumn:1,params:{}}},b);importText(guides[b.experiment].sample,'示例')};$('#record-scene').onclick=()=>recordScene(b);
 $('#run-analysis').onclick=()=>{try{if(!b.source)throw Error('请先标记数据来源');const analysis=analyzeTable(parseTable(b.csv),b.config);update({analysis,interpretation:'',review:'',reviewed:false},b);alert='';render()}catch(e){setStudyAlert(e.message);render()}};
 $('#interpret').onclick=()=>assist('interpret','请解释这些结果，并根据残差和实验条件提出可验证的误差分析建议。',b);
 if(a){$('#export-analysis').onclick=()=>download(`${b.experiment}-analysis.json`,JSON.stringify({source:b.source,analysis:summarizeAnalysis(a)},null,2),'application/json');$('#export-plot').onclick=()=>download(`${b.experiment}-plot.svg`,chartSVG(a),'image/svg+xml');$('#export-processed').onclick=()=>download(`${b.experiment}-processed.csv`,['source,row,x,y,predicted,residual',...a.points.map((p,i)=>[b.source,p.row,p.x,p.y,a.fit?.predicted[i]??'',a.fit?.residuals[i]??''].join(','))].join('\n'),'text/csv;charset=utf-8')}
}
function invalidateConfig(b,patch){update({config:{...b.config,...patch},analysis:null,interpretation:'',review:'',reviewed:false},b);render()}
function f(n){return Number.isFinite(n)?Number(n).toPrecision(5):'—'}
function renderAnalysis(a,b){return card('分析结果',`<div class="answer-source">本地数值计算 · 数据来源：${escape(b.source)} · ${a.n} 组数据</div><div class="analysis-metrics">${a.derived.map(d=>`<div><small>${escape(d.label)}</small><b>${f(d.value)} <em>${escape(d.unit)}</em></b></div>`).join('')}${a.fit?`<div><small>R²</small><b>${f(a.fit.r2)}</b></div><div><small>RMSE（纵轴单位）</small><b>${f(a.fit.rmse)}</b></div>`:''}</div>${a.fit?.slope!==undefined?`<p class="fit-equation">y = ${f(a.fit.slope)} x + (${f(a.fit.intercept)})</p><p class="study-muted">斜率标准误 ${f(a.fit.slopeSE)}；截距标准误 ${f(a.fit.interceptSE)}。采用独立、同方差残差假设，未包含仪器校准不确定度。</p>`:''}<div class="analysis-chart">${chartSVG(a)}</div>${a.fit?`<div class="residual-chart">${chartSVG(a,true)}</div>`:''}${a.warnings.length?`<div class="analysis-warnings">${list(a.warnings)}</div>`:''}<div class="card-actions"><button id="export-plot">导出 SVG 图</button><button id="export-processed">导出拟合 / 残差 CSV</button><button id="export-analysis">导出计算摘要</button></div>`)}
export function chartSVG(a,residual=false){const points=a.points.map((p,i)=>({x:p.x,y:residual?a.fit.residuals[i]:p.y}));let minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));if(residual){minY=Math.min(minY,0);maxY=Math.max(maxY,0)}if(minX===maxX){minX-=1;maxX+=1}if(minY===maxY){minY-=1;maxY+=1}const pad=(maxY-minY)*.12;minY-=pad;maxY+=pad;const x=v=>70+(v-minX)/(maxX-minX)*680,y=v=>245-(v-minY)/(maxY-minY)*205;const title=residual?'拟合残差':a.methodName;let parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><rect width="800" height="300" rx="12" fill="#f7faff"/><text x="70" y="23" fill="#4d6380" font-size="12">${escape(title)} · ${a.n} points</text>`];for(let i=0;i<=4;i++){const yy=40+i*205/4,xx=70+i*680/4;parts.push(`<path d="M70 ${yy}H750 M${xx} 40V245" stroke="#e1e9f4"/><text x="62" y="${yy+4}" text-anchor="end" fill="#8b9bb1" font-size="10">${Number(maxY-i*(maxY-minY)/4).toPrecision(3)}</text><text x="${xx}" y="263" text-anchor="middle" fill="#8b9bb1" font-size="10">${Number(minX+i*(maxX-minX)/4).toPrecision(3)}</text>`)}
 if(!residual&&a.fit){const sorted=a.points.map((p,i)=>({x:p.x,y:a.fit.predicted[i]})).sort((a,b)=>a.x-b.x);parts.push(`<polyline points="${sorted.map(p=>`${x(p.x)},${y(p.y)}`).join(' ')}" fill="none" stroke="#ed9a55" stroke-width="2"/>`)}if(residual)parts.push(`<path d="M70 ${y(0)}H750" stroke="#e7a066" stroke-dasharray="5 4"/>`);
 const stride=Math.max(1,Math.ceil(points.length/1500));points.forEach((p,i)=>{if(i%stride===0)parts.push(`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="3" fill="#4383dc" opacity=".85"><title>row ${a.points[i].row}: ${p.x}, ${p.y}</title></circle>`)});parts.push(`<text x="410" y="289" text-anchor="middle" fill="#647b98" font-size="11">${escape(a.xLabel)}</text><text x="17" y="145" transform="rotate(-90 17 145)" text-anchor="middle" fill="#647b98" font-size="11">${escape(residual?'残差（'+a.yLabel+'）':a.yLabel)}</text></svg>`);return parts.join('')}
function recordScene(b){let observation;try{observation=captureObservation(scene,b.experiment)}catch(e){setStudyAlert(e.message);render();return}const {row,headers,method}=observation,params={...b.config.params};
 if(b.csv&&(b.source!=='仿真'||b.config.method!==method)){setStudyAlert('当前表已含其他来源或模型的数据。请新建实验记录，避免混用。');render();return}
 const csv=b.csv?b.csv.trim()+'\n'+row.join(','):headers.join(',')+'\n'+row.join(',');update({csv,source:'仿真',analysis:null,interpretation:'',review:'',config:{method,xColumn:0,yColumn:1,params}},b);setStudyAlert('已追加 1 组仿真读数。返回场景改变参数后可继续采集。');render();}
function reportMarkdown(b){const a=b.analysis;return `# ${experiments[b.experiment].name} 实验报告草稿\n\n## 实验目的\n${guides[b.experiment].objectives.map(s=>'- '+s).join('\n')}\n\n## 实验原理\n${guides[b.experiment].principle}\n\n## 仪器与步骤\n${b.notes||'【请据实填写仪器型号、参数、操作过程和异常现象】'}\n\n## 数据与图表\n数据来源：${b.source||'尚无数据'}。\n${a?`分析方法：${a.methodName}；${a.n} 组数据。\n${a.derived.map(d=>`${d.label}：${f(d.value)} ${d.unit}`).join('\n')}\n${a.fit?`R²=${f(a.fit.r2)}，RMSE=${f(a.fit.rmse)}（${a.yLabel}）。`:''}`:'【请先导入并分析实验数据】'}\n【请附原始数据和导出的图表，并解释单位与拟合方法】\n\n## 误差分析\n【请结合残差、仪器精度和实际操作，验证可能的误差来源】\n\n## 结论\n【请用数据支持结论，并说明模型与测量局限】\n`;}
function renderReport(b){const checks=reportChecks(b.report,b.analysis,b.source);$('#study-content').innerHTML=`<div class="study-two-col"><div>${card('报告草稿',`<p class="study-muted">先用已计算结果整理提纲，再据实补充实验过程与结论。提纲保留待填写项。</p><div class="card-actions"><button id="report-outline">${b.report?'用当前结果重新生成提纲':'生成报告提纲'}</button><label class="file-button">导入 Markdown / TXT<input id="report-file" type="file" accept=".md,.txt"></label><button id="report-export">导出 Markdown</button></div><label for="report-draft">实验报告正文（自动保存）</label><textarea id="report-draft" rows="25" maxlength="30000" placeholder="粘贴或撰写你的报告…">${escape(b.report)}</textarea><button class="danger" id="delete-notebook">删除这份本地实验记录</button>`)}</div><div>${card('结构与数据自查',`<div id="report-checks">${list(checks)}</div><p class="study-muted">本地规则仅检查结构关键词、数据状态和分析警告，不自动评定正确性。</p><label><input type="checkbox" id="report-reviewed" ${b.reviewed?'checked':''}> 我已核对原始数据、图表单位和待填写项</label>`) +card('AI 报告检查',`<p class="study-muted">将当前正文和计算摘要交给 AI，检查证据、单位、误差分析与结论。不会自动修改正文。</p><button class="primary" id="review-report" ${!b.report.trim()||busy('review',b)?'disabled':''}>${busy('review',b)?'AI 正在检查…':'检查当前报告'}</button><div id="review-result">${busy('review',b)?studyPreview('review',b):b.review?aiText(b.review,b.reviewProvider):'<p class="study-muted">尚无 AI 检查意见。</p>'}</div>`)}</div></div>`;
 $('#report-draft').oninput=e=>{update({report:e.target.value,review:'',reviewed:false},b);$('#report-checks').innerHTML=list(reportChecks(b.report,b.analysis,b.source));$('#review-report').disabled=!b.report.trim()||busy('review',b);$('#report-reviewed').checked=false;if(!busy('review',b))$('#review-result').textContent='正文已修改，请重新检查。'};$('#report-reviewed').onchange=e=>update({reviewed:e.target.checked},b);
 $('#report-outline').onclick=()=>{if(b.report&&!confirm('用当前数据重新生成提纲将覆盖现有报告正文。继续吗？'))return;update({report:reportMarkdown(b),review:'',reviewed:false},b);render()};$('#report-export').onclick=()=>download(`${b.experiment}-report.md`,b.report||reportMarkdown(b),'text/markdown;charset=utf-8');$('#report-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>100000){setStudyAlert('报告文件过大，请限制为 30,000 字以内。');render();return}const text=await file.text();if(text.length>30000){setStudyAlert('报告超过 30,000 字。');render();return}if(b.report&&!confirm('导入报告将覆盖现有正文。继续吗？'))return;update({report:text,review:'',reviewed:false},b);render()};$('#review-report').onclick=()=>assist('review',b.report,b);
 $('#delete-notebook').onclick=()=>deleteNotebook(b);
}
$('#study-close').onclick=()=>{if(page==='settings'){page=settingsOrigin?.page||'home';settingsOrigin=null}setOpen(false)};$('#study-brand').onclick=()=>{page='home';dismissStudyAlert();render()};$('#study-home').onclick=showCourses;$('#study-settings').onclick=showSettings;$('#study-settings-back').onclick=closeSettings;$('#backup').onclick=()=>download('optilab-notebooks.json',JSON.stringify({version:2,books},null,2),'application/json');$('#backup-import').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>50_000_000)throw Error('备份最大 50 MB');const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));if(data.version!==2||!Array.isArray(data.books)||data.books.length>30)throw Error('备份格式无效');const restored=data.books.map(value=>({...normalizeBook(value),id:crypto.randomUUID()}));if(books.length+restored.length>30)throw Error('导入后超过 30 本记录上限');books.push(...restored);save();setStudyAlert('已导入备份，现有实验未覆盖。');render()}catch(err){setStudyAlert(err.message);render()}};
window.addEventListener('optilab:state',e=>{scene=e.detail;const b=current();if(b&&b.experiment===scene.experiment){b.scene=normalizeScene(scene);save()}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!shell.hidden){if(page==='settings')closeSettings();else setOpen(false)}});

// In-scene chat shares the matching notebook conversation, and keeps free-lab chats separate.
const benchChatsKey='optilab-bench-chat-v1';let benchChats={};
try{const saved=JSON.parse(localStorage.getItem(benchChatsKey)||'{}');for(const key of Object.keys(experiments))if(Array.isArray(saved[key]))benchChats[key]=saved[key].filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.text==='string').slice(-60).map(m=>({role:m.role,text:m.text.slice(0,16000),provider:String(m.provider||'').slice(0,200)}))}catch{}
const benchRequests=new Map();let benchError='',benchLastHTML='',benchLastDraft;
const benchToggle=document.createElement('button');benchToggle.id='bench-ai-toggle';benchToggle.textContent='✦ AI 助教';benchToggle.setAttribute('aria-expanded','false');$('#help').before(benchToggle);
const benchSettings=document.createElement('button');benchSettings.id='bench-settings';benchSettings.textContent='⚙ 应用设置';$('.header-actions').append(benchSettings);
const benchPanel=document.createElement('aside');benchPanel.id='bench-ai';benchPanel.className='floating-panel';benchPanel.hidden=true;benchPanel.setAttribute('aria-label','实验台 AI 助教');benchPanel.innerHTML='<div class="bench-ai-head"><div><small>IN-LAB ASSISTANT</small><h2>实验台 AI 助教</h2></div><button id="bench-ai-close" aria-label="关闭实验台助教">×</button></div><div id="bench-ai-context"></div><div class="bench-quick"><button data-bench-q="请检查当前光路，说明可以观察什么现象。">当前光路</button><button data-bench-q="选中的仪器如何使用，有哪些注意事项？">仪器用法</button><button id="bench-ai-settings">AI 设置</button></div><div id="bench-chat-messages" aria-live="polite"></div><div id="bench-ai-error" role="status"></div><form id="bench-ai-form"><label for="bench-ai-question">关于当前实验的问题</label><textarea id="bench-ai-question" maxlength="3000" rows="3" required placeholder="例如：为什么观察屏没有条纹？"></textarea><div class="bench-actions"><button type="button" id="bench-local">查内置指导</button><button class="primary" id="bench-send">发送给 AI</button></div></form>';
$('#app').append(benchPanel);
function benchTarget(){const key=scene?.experiment||'free',b=current();return {experiment:key,book:b?.experiment===key?b:null,key:b?.experiment===key?b.id:key}}
function benchMessages(target){return target.book?target.book.chat:(benchChats[target.experiment]||[])}
function appendBench(target,message){if(target.book)update({chat:[...target.book.chat,message].slice(-100)},target.book);else{benchChats[target.experiment]=[...(benchChats[target.experiment]||[]),message].slice(-60);try{localStorage.setItem(benchChatsKey,JSON.stringify(benchChats))}catch{benchError='对话存储空间不足，请及时记录重要内容。'}}}
function renderBenchChat(){if(!document.querySelector('#bench-ai'))return;const t=benchTarget(),selected=scene?.items?.find(a=>a.id===scene.selected);$('#bench-ai-context').textContent=experiments[t.experiment].name+' · '+(selected?'选中：'+TYPES[selected.type].name:'未选中仪器')+' · '+(status.configured?'已配置 '+(status.provider||'AI 服务'):'内置指导模式');const draft=benchRequests.get(t.key),busy=Boolean(draft);const chatHTML=(benchMessages(t).map(m=>'<article class="chat-message '+m.role+'"><small>'+escape(m.role==='user'?'我的问题':m.provider)+'</small>'+renderMessageContent(m)+'</article>').join('')||'<p class="study-muted">边操作边提问。AI 将结合当前器件、参数与读数回答。</p>');if(chatHTML!==benchLastHTML||draft!==benchLastDraft){$('#bench-chat-messages').innerHTML=chatHTML+streamPreview('chat',draft);benchLastHTML=chatHTML;benchLastDraft=draft;$('#bench-chat-messages').scrollTop=999999;}$('#bench-ai-error').textContent=benchError;$('#bench-send').disabled=busy;$('#bench-local').disabled=busy;$('#bench-send').textContent=busy?'回答中…':'发送给 AI';}
function showBench(on){benchPanel.hidden=!on;benchToggle.setAttribute('aria-expanded',String(on));if(on){renderBenchChat();$('#bench-ai-question').focus()}}
function showSettings(event){
 if(page==='settings'&&!shell.hidden)return;
 settingsOrigin={page:page==='settings'?'home':page,inLab:shell.hidden,scrollTop:$('#study-scroll').scrollTop,trigger:event?.currentTarget};
 page='settings';
 dismissStudyAlert();
 setOpen(true);
 render();
 $('#study-settings-back').focus();
}
function closeSettings(){
 const origin=settingsOrigin;
 settingsOrigin=null;
 page=origin?.page||'home';
 dismissStudyAlert();
 if(origin?.inLab)setOpen(false);
 render();
 if(origin&&!origin.inLab)$('#study-scroll').scrollTop=origin.scrollTop;
 if(origin?.trigger?.isConnected)origin.trigger.focus();
 else if(!shell.hidden)($('#mobile-settings')?.offsetWidth?$('#mobile-settings'):$('#study-settings')).focus();
}
benchToggle.onclick=()=>showBench(benchPanel.hidden);$('#bench-ai-close').onclick=()=>showBench(false);benchSettings.onclick=showSettings;$('#bench-ai-settings').onclick=showSettings;
async function askBench(question,local=false){if(!question.trim())return;const t=benchTarget();if(benchRequests.has(t.key))return;const history=benchMessages(t).slice(-8).filter(m=>m.provider!=='内置资料检索').map(m=>({role:m.role,content:m.text}));appendBench(t,{role:'user',text:question,provider:'学生'});benchError='';
 if(local){const a=scene?.items?.find(a=>a.id===scene.selected),manual=a&&instrumentGuides[a.type];const answer=manual&&/仪器|用法|怎么用|注意事项/.test(question)?manual.use+'\n\n注意事项：'+manual.care:localAnswer(t.experiment,question);appendBench(t,{role:'assistant',text:answer,provider:'内置资料检索'});$('#bench-ai-question').value='';renderBenchChat();return;}
 const draft={text:'',frame:0};benchRequests.set(t.key,draft);renderBenchChat();
 try{const data=await requestAI('/api/assist',{task:'chat',experiment:t.experiment,message:question,history,scene,analysis:t.book?summarizeAnalysis(t.book.analysis):null,dataSource:t.book?.source||'仿真场景'},text=>{
  queuePreview(draft,text,()=>benchLastDraft===draft&&benchRequests.get(t.key)===draft?$('#bench-chat-messages [data-ai-preview]'):null);
 });appendBench(t,{role:'assistant',text:data.answer,provider:data.provider+' · '+data.model+(data.incomplete?' · 回答可能未完成':'')});if($('#bench-ai-question').value===question)$('#bench-ai-question').value='';}catch(e){benchError=e.message}finally{benchRequests.delete(t.key);renderBenchChat()}}
$('#bench-ai-form').onsubmit=e=>{e.preventDefault();askBench($('#bench-ai-question').value)};$('#bench-local').onclick=()=>askBench($('#bench-ai-question').value,true);document.querySelectorAll('[data-bench-q]').forEach(el=>el.onclick=()=>askBench(el.dataset.benchQ,!status.configured));
window.addEventListener('optilab:state',()=>renderBenchChat());

await refreshStatus();setOpen(true);render();
