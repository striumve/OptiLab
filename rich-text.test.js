import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRichText,renderMessageContent} from './src/rich-text.js';

test('AI Markdown renders headings, emphasis, lists, tables, links and code',()=>{
 const html=renderRichText('# 光电实验\n\n**重点**与*说明*\n\n1. 调节透镜\n2. 记录数据\n\n| 变量 | 单位 |\n| --- | --- |\n| 焦距 | cm |\n\n> 观察记录\n\n`f = 15`\n\n```js\nconst f = 15;\n```\n\n[资料](https://example.com)');
 for(const tag of ['<h1>','<strong>','<em>','<ol>','<table>','<blockquote>','<code>','<pre>'])assert.ok(html.includes(tag),tag);
 assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/);
});
test('all common TeX delimiters render fractions and accessible MathML',()=>{
 for(const source of [String.raw`焦距 $\frac{1}{f}$`,String.raw`焦距 \(\frac{1}{f}\)`,String.raw`$$\frac{1}{f}=\frac{1}{u}+\frac{1}{v}$$`,String.raw`\[\frac{1}{f}=\frac{1}{u}+\frac{1}{v}\]`]){const html=renderRichText(source);assert.match(html,/class="katex/);assert.match(html,/<math/);assert.match(html,/mfrac/)}
});
test('multiline equations, matrices, list equations and math fences work',()=>{
 const block=renderRichText(String.raw`\[
\begin{aligned}
I &= I_0\cos^2\theta \\
f_c &= \frac{1}{2\pi RC}
\end{aligned}
\]`);assert.match(block,/katex-display/);assert.match(block,/mtable/);
 const fenced=renderRichText('```latex\n\\frac{1}{f}=\\frac{1}{u}+\\frac{1}{v}\n```');assert.match(fenced,/katex-display/);
 assert.match(renderRichText('- 成像：\\(v=\\frac{fu}{u-f}\\)'),/class="katex/);
});
test('code, escaped dollars, currency and unclosed formulas remain literal',()=>{
 const code=renderRichText('`$x^2$`\n\n```text\n\\(x^2\\)\n```');assert.doesNotMatch(code,/class="katex/);assert.match(code,/\$x\^2\$/);
 assert.doesNotMatch(renderRichText(String.raw`价格 \$5，另一个 $10，合计 $15。`),/class="katex/);
 assert.match(renderRichText(String.raw`未结束 \(\frac{1}{f}`),/frac/);
});
test('unsupported formulas degrade locally and do not hide the remaining reply',()=>{
 const html=renderRichText(String.raw`前文 $\unknownCommand{a}$ 后文 **仍可阅读**`);assert.match(html,/math-fallback/);assert.match(html,/unknownCommand/);assert.match(html,/<strong>仍可阅读<\/strong>/);
 const loop=renderRichText(String.raw`$\def\a{\a}\a$`);assert.match(loop,/math-fallback/);
});
test('untrusted HTML, dangerous links, images and trusted TeX commands stay inert',()=>{
 const html=renderRichText('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[点击](javascript:alert(1))\n\n![图片](https://tracker.example/pixel)\n\n'+String.raw`$\href{javascript:alert(1)}{点击}$`);
 assert.doesNotMatch(html,/<script|<img|href="javascript:|onerror="/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/src="https:\/\/tracker/);
});
test('only assistant messages are rich text, original content remains unchanged',()=>{
 const message={role:'assistant',text:'**成像** $x^2$'};assert.match(renderMessageContent(message),/<strong>/);assert.equal(message.text,'**成像** $x^2$');
 const user=renderMessageContent({...message,role:'user'});assert.doesNotMatch(user,/<strong>|class="katex/);assert.match(user,/plain-message/);
});
