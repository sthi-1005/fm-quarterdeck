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
 const order=()=>browser.evaluate(`[...document.querySelectorAll('#quota-strip .quota-badge')].map(n=>JSON.parse(n.dataset.quotaKey)[0])`);
 assert.deepEqual(await order(),['muse','grok','agy','claude','codex','cursor']);
 const sort=async value=>{await browser.evaluate(`(()=>{const s=document.querySelector('#sidebar-quota-sort');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change'))})()`);};
 await sort('lowest');assert.deepEqual(await order(),['codex','claude','agy','grok','muse','cursor']);
 await sort('runway');assert.deepEqual(await order(),['codex','claude','agy','grok','cursor','muse']);
 assert.equal(await browser.evaluate(`document.querySelectorAll('.quota-sort-basis').length`),6);
 assert.match(await browser.evaluate(`document.querySelector('#quota-strip').textContent`),/Runway: unknown/);
 await browser.command('Page.reload');await browser.until(`document.querySelectorAll('.quota-sort-basis').length === 6`);
 assert.equal(await browser.evaluate(`document.querySelector('#sidebar-quota-sort').value`),'runway');
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
