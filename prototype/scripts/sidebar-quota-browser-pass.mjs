// Offline synthetic acceptance; run from a clean committed checkout.
import assert from 'node:assert/strict';
import {createServer} from '../server.js';
import {openBrowser} from './browser-harness.mjs';
let count=6;
const now=Date.now();
const names=['codex','claude','agy','grok','cursor','muse'];
const providers=names.map((provider,i)=>({provider,status:'fresh',authStatus:'usable',refreshedAt:new Date(now).toISOString(),stale:i===4,scopes:[],windows:[{id:'session',label:'5-hour',kind:'session',percentRemaining:20+i*12,resetsAt:new Date(now+600000).toISOString(),pace:i===5?{status:'unknown'}:{status:'behind',reservePercentPoints:40-i*10}}]}));
const app=createServer({}, {quotaReader:async()=>({providers:providers.slice(0,count),readAt:new Date(now).toISOString(),maxAgeMs:300000})});
await new Promise(r=>app.listen(0,'127.0.0.1',r));
const browser=await openBrowser();
const url=`http://127.0.0.1:${app.address().port}`;
try {
 await browser.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await browser.command('Page.navigate',{url});
 await browser.until(`document.querySelectorAll('#quota-strip .quota-badge').length === 6`);
 const geometry=()=>browser.evaluate(`(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {height:r('#sidebar-quota').height,top:r('#sidebar-quota').top,navBottom:r('.primary-nav').bottom,footerTop:r('.source-status').top,bottom:r('#sidebar-quota').bottom,footerBottom:r('.source-status').bottom,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 const safe=g=>{assert.ok(g.top>=g.navBottom-1);assert.ok(g.bottom<=g.footerTop+1);assert.ok(g.footerBottom<=1001);assert.equal(g.overflow,false);};
 const many=await geometry();safe(many);assert.ok(many.height>220);
 // Header controls keep their heights, never overlap or clip text, and stay inside the pane at narrow, default and wide widths.
 const header=async nav=>{
  await browser.evaluate(`(()=>{const ws=document.querySelector('.workspace');${nav?`ws.style.setProperty('--nav-width','${nav}px');ws.style.setProperty('--shell-nav-width','${nav}px')`:`ws.style.removeProperty('--nav-width');ws.style.removeProperty('--shell-nav-width')`}})()`);
  await new Promise(r=>setTimeout(r,100));
  return browser.evaluate(`(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();const head=box('.sidebar-quota-head');const parts=['.sidebar-quota-heading > span','#sidebar-quota-freshness','#sidebar-quota-sort','.sidebar-quota-link','#sidebar-quota-toggle'].map(s=>{const r=box(s);return {s,left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}});return {head:{left:head.left,right:head.right},parts,clipped:['.sidebar-quota-heading > span','#sidebar-quota-freshness'].some(s=>{const n=document.querySelector(s);return n.scrollWidth>n.clientWidth})}})()`);
 };
 for(const nav of [220,null,420]) {
  const h=await header(nav);
  const controls=h.parts.filter(p=>!p.s.startsWith('.sidebar-quota-heading')&&p.s!=='#sidebar-quota-freshness');
  for(const c of controls) assert.equal(Math.round(c.height),c.s==='#sidebar-quota-sort'?24:20,`${c.s} height at ${nav}`);
  for(const p of h.parts) {assert.ok(p.left>=h.head.left-1&&p.right<=h.head.right+1,`${p.s} inside header at ${nav}`);}
  for(const [i,a] of h.parts.entries()) for(const b of h.parts.slice(i+1)) assert.ok(a.right<=b.left+0.5||b.right<=a.left+0.5||a.bottom<=b.top+0.5||b.bottom<=a.top+0.5,`${a.s} overlaps ${b.s} at ${nav}`);
  assert.equal(h.clipped,false,`header text clipped at ${nav}`);
  const sort=h.parts.find(p=>p.s==='#sidebar-quota-sort'),title=h.parts[0];
  assert.ok(sort.top>title.bottom-1,`sort sits below the caption at ${nav}`);
 }
 await header(null);
 const order=()=>browser.evaluate(`[...document.querySelectorAll('#quota-strip .quota-badge')].map(n=>JSON.parse(n.dataset.quotaKey)[0])`);
 assert.deepEqual(await order(),['muse','grok','agy','claude','codex','cursor']);
 // Segmented control: Left (select again to reverse) and Runway; drive it by clicks only.
 const sortState=()=>browser.evaluate(`(()=>{const g=document.querySelector('#sidebar-quota-sort');const [left,runway]=g.querySelectorAll('[data-sort]');return {stored:localStorage.getItem('fm-agentos-sidebar-quota-sort.v1'),left:left.getAttribute('aria-pressed'),runway:runway.getAttribute('aria-pressed'),direction:left.textContent,leftLabel:left.getAttribute('aria-label'),group:g.getAttribute('aria-label')}})()`);
 const click=key=>browser.evaluate(`document.querySelector('#sidebar-quota-sort [data-sort="${key}"]').click()`);
 const sort=async value=>{let guard=0;while((await sortState()).stored!==value&&guard++<4) await click(value==='runway'?'runway':'left');assert.equal((await sortState()).stored,value);};
 assert.deepEqual(await sortState(),{stored:null,left:'true',runway:'false',direction:'Left↓',leftLabel:'Remaining capacity, highest first',group:'Sort quota limits: highest remaining capacity first; unknown and stale last'});
 await click('left');assert.deepEqual(await sortState(),{stored:'lowest',left:'true',runway:'false',direction:'Left↑',leftLabel:'Remaining capacity, lowest first',group:'Sort quota limits: lowest remaining capacity first; unknown and stale last'});
 await click('runway');assert.equal((await sortState()).runway,'true');assert.equal((await sortState()).left,'false');
 await click('left');assert.equal((await sortState()).stored,'lowest','returning from Runway keeps the last Left direction');
 await click('left');assert.equal((await sortState()).stored,'highest');
 await sort('lowest');assert.deepEqual(await order(),['codex','claude','agy','grok','muse','cursor']);
 await sort('runway');assert.deepEqual(await order(),['codex','claude','agy','grok','cursor','muse']);
 assert.equal(await browser.evaluate(`document.querySelectorAll('.quota-sort-basis').length`),6);
 assert.match(await browser.evaluate(`document.querySelector('#quota-strip').textContent`),/Runway: unknown/);
 await browser.command('Page.reload');await browser.until(`document.querySelectorAll('.quota-sort-basis').length === 6`);
 assert.equal((await sortState()).runway,'true');
 await browser.evaluate(`document.querySelector('#sidebar-quota-toggle').click()`);
 assert.equal(await browser.evaluate(`document.querySelector('#sidebar-quota-toggle').getAttribute('aria-expanded')`),'false');
 assert.ok((await geometry()).height<80);
 await browser.command('Page.reload');await browser.until(`document.querySelector('#sidebar-quota-toggle')?.getAttribute('aria-expanded') === 'false' && document.querySelectorAll('#quota-strip .quota-badge').length === 6`);
 await browser.evaluate(`document.querySelector('#sidebar-quota-toggle').click()`);await sort('highest');
 await browser.evaluate(`document.querySelector('#quota-resize').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
 const manual=await geometry();
 count=2;await browser.evaluate(`document.querySelector('#refresh').click()`);await browser.until(`document.querySelectorAll('#quota-strip .quota-badge').length === 2`);
 assert.equal((await geometry()).height,manual.height,'refresh retains manual height');
 await browser.command('Page.reload');await browser.until(`document.querySelectorAll('#quota-strip .quota-badge').length === 2`);
 assert.equal((await geometry()).height,manual.height,'reload restores manual height');
 await browser.evaluate(`document.querySelector('#quota-resize').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
 await new Promise(r=>setTimeout(r,100));
 const few=await geometry();safe(few);assert.ok(few.height<manual.height);assert.ok(few.height<240);
 count=1;await browser.evaluate(`document.querySelector('#refresh').click()`);await browser.until(`document.querySelectorAll('#quota-strip .quota-badge').length === 1`);await new Promise(r=>setTimeout(r,100));
 const one=await geometry();safe(one);assert.ok(one.height<few.height,'live refresh shrinks to intrinsic content');
 for(const [width,height] of [[1024,900],[1024,600],[390,844]]) {
  await browser.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await browser.evaluate(`document.documentElement.scrollWidth>innerWidth`),false);
  if(width>720) {const g=await geometry();assert.ok(g.bottom<=g.footerTop+1);assert.ok(g.footerBottom<=height+1);}
  else {await browser.evaluate(`document.querySelector('.mobile-dock-quota').click()`);await browser.until(`document.querySelector('#mobile-quota-sheet').open`);assert.equal(await browser.evaluate(`document.querySelectorAll('.mobile-quota-sheet-row').length`),1);}
 }
 console.log('Sidebar quota browser acceptance passed: bounded auto/content sizing, persisted manual sizing/collapse/sort, source runway, tablet and phone.');
} finally {await browser.close();await new Promise(r=>app.close(r));}
