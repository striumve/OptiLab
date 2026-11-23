import {spawn,fork} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
process.chdir(root);
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<12)){console.error('需要 Node.js 22.12 或更新版本，请先更新 Node.js。');process.exit(1)}
function npm(args){return new Promise((resolve,reject)=>{
 // Arguments are fixed by this script; no user input is passed to the shell.
 const child=spawn(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('npm '+args.join(' ')+' 失败（'+code+'）')));
})}
async function openBrowser(url){
 const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
 child.on('error',()=>console.warn('无法自动打开浏览器，请打开上方本地地址。'));
}
try{
 console.log('OptiLab 一键启动\n正在检查运行环境…');
 const require=createRequire(import.meta.url);
 let missing=false;for(const name of ['vite','three','markdown-it','katex'])try{require.resolve(name)}catch{missing=true}
 if(missing){console.log('首次启动：正在安装依赖，需要网络连接。');await npm(['ci'])}
 console.log('正在准备应用…');await npm(['run','build']);
 console.log('正在启动本地服务；关闭此窗口或按 Ctrl+C 可停止。');
 const child=fork(path.join(root,'server.js'),['--production'],{cwd:root,stdio:['inherit','inherit','inherit','ipc']});
 let stopping=false,ready=false;
 child.on('message',message=>{if(message?.type==='ready'){ready=true;if(process.send)process.send({...message,serverPid:child.pid});console.log('\n应用已启动：'+message.url);if(!process.argv.includes('--no-open'))openBrowser(message.url)}});
 child.on('error',error=>{console.error('无法启动服务：'+error.message);process.exitCode=1});
 child.on('exit',code=>{if(process.connected)process.disconnect();if(!stopping&&(!ready||code)){console.error('服务已退出，请查看上方错误信息。');process.exitCode=code||1}});
 process.on('message',message=>{if(message?.type==='shutdown'){stopping=true;child.kill();}});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;child.kill();});
}catch(error){console.error('\n启动失败：'+error.message+'\n请检查 Node.js / npm 安装和网络连接，然后重新双击启动。');process.exitCode=1}
