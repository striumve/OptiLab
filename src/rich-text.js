import MarkdownIt from 'markdown-it';
import katex from 'katex';

const md = new MarkdownIt({html:false,breaks:true,linkify:true,maxNesting:32});
const escape = md.utils.escapeHtml;
function escapedAt(source,index){let count=0;while(index>0&&source[--index]==='\\')count++;return count%2===1;}
function findClosing(source,delimiter,start){let position=start;while((position=source.indexOf(delimiter,position))!==-1){if(!escapedAt(source,position))return position;position+=delimiter.length;}return -1;}
function mathHTML(source,display){
 try{
  if(source.length>8000)throw Error('Formula too long');
  return katex.renderToString(source,{displayMode:display,output:'htmlAndMathml',throwOnError:true,trust:false,strict:'ignore',maxExpand:500,maxSize:20,macros:{}});
 }catch{return `<code class="math-fallback" title="公式暂无法排版，已保留原文">${escape(source)}</code>`;}
}
// Parse math as Markdown tokens, before backslash escaping or emphasis can consume TeX.
md.inline.ruler.before('escape','optilab_math',(state,silent)=>{
 const start=state.pos,source=state.src;let opening,closing,display=false;
 if(source.startsWith('\\(',start)){opening='\\(';closing='\\)';}
 else if(source.startsWith('\\[',start)){opening='\\[';closing='\\]';display=true;}
 else if(source.startsWith('$$',start)){opening=closing='$$';display=true;}
 else if(source[start]==='$'&&!/\s/.test(source[start+1]||' ')){opening=closing='$';}
 else return false;
 const end=findClosing(source,closing,start+opening.length);
 if(end<0||end===start+opening.length)return false;
 if(opening==='$'&&(source[end-1].trim()===''||/\d/.test(source[end+1]||'')))return false;
 if(!silent){const token=state.push('optilab_math','math',0);token.content=source.slice(start+opening.length,end);token.meta={display};}
 state.pos=end+closing.length;return true;
});
md.block.ruler.before('fence','optilab_math_block',(state,startLine,endLine,silent)=>{
 if(state.sCount[startLine]-state.blkIndent>=4)return false;
 const first=state.src.slice(state.bMarks[startLine]+state.tShift[startLine],state.eMarks[startLine]);
 const opening=first.startsWith('$$')?'$$':first.startsWith('\\[')?'\\[':null;
 if(!opening)return false;const closing=opening==='$$'?'$$':'\\]';
 let line=startLine,content=first.slice(opening.length),end=findClosing(content,closing,0);
 if(end>=0){if(content.slice(end+closing.length).trim())return false;content=content.slice(0,end);}
 else{
  const lines=[content];let found=false;
  for(line=startLine+1;line<endLine;line++){
   if(state.sCount[line]<state.blkIndent&&state.src.slice(state.bMarks[line],state.eMarks[line]).trim())break;
   const value=state.getLines(line,line+1,state.blkIndent,false).replace(/\n$/,'');end=findClosing(value,closing,0);
   if(end>=0){if(value.slice(end+closing.length).trim())return false;lines.push(value.slice(0,end));found=true;break;}lines.push(value);
  }
  if(!found)return false;content=lines.join('\n');
 }
 if(silent)return true;
 const token=state.push('optilab_math','math',0);token.block=true;token.content=content.trim();token.map=[startLine,line+1];token.meta={display:true};state.line=line+1;return true;
},{alt:['paragraph','reference','blockquote','list']});
md.renderer.rules.optilab_math=(tokens,index)=>mathHTML(tokens[index].content,tokens[index].meta.display)+(tokens[index].block?'\n':'');
const originalFence=md.renderer.rules.fence;
md.renderer.rules.fence=(tokens,index,options,env,self)=>/^(math|latex|tex)$/i.test(tokens[index].info.trim())?mathHTML(tokens[index].content,true)+'\n':originalFence(tokens,index,options,env,self);
const originalLink=md.renderer.rules.link_open;
md.renderer.rules.link_open=(tokens,index,options,env,self)=>{tokens[index].attrSet('target','_blank');tokens[index].attrSet('rel','noopener noreferrer');return originalLink?originalLink(tokens,index,options,env,self):self.renderToken(tokens,index,options);};
// AI replies must not automatically load external images or tracking pixels.
md.renderer.rules.image=(tokens,index)=>escape(tokens[index].content||'[图片]');
const originalTable=md.renderer.rules.table_open;
md.renderer.rules.table_open=(tokens,index,options,env,self)=>'<div class="markdown-table">'+(originalTable?originalTable(tokens,index,options,env,self):self.renderToken(tokens,index,options));
md.renderer.rules.table_close=()=>'</table></div>\n';
const cache=new Map();
export function renderRichText(value){const text=String(value??'');if(cache.has(text))return cache.get(text);const html=md.render(text);cache.set(text,html);if(cache.size>64)cache.delete(cache.keys().next().value);return html;}
export function renderMessageContent(message){return message.role==='assistant'?`<div class="rich-text">${renderRichText(message.text)}</div>`:`<div class="plain-message">${escape(String(message.text??''))}</div>`;}
