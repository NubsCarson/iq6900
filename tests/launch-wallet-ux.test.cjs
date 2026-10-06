const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const jquery=require('jquery');
const tick=()=>new Promise(setImmediate);
async function mount(t, connect, boardRows = [], evm) {
 const dom=new JSDOM('<div id="main_section"></div>',{url:'https://iqlabs.dev/?menu=codein',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.$=w.jQuery=jquery(w);w.TextEncoder=TextEncoder;w.fetch=async()=>({ok:true,json:async()=>({pairs:[]})});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(value){this.returnValue=value;this.open=false;this.dispatchEvent(new w.Event('close'));};
 const listeners=new Map();const calls=[];let metadata=0,launches=0,registrations=0;
 const key={toString:()=> 'test-wallet',toBase58:()=> 'test-wallet'};
 w.phantom={solana:{publicKey:key,connect:async opts=>{calls.push(opts);return connect?connect(opts):{publicKey:key};},on:(e,f)=>listeners.set(e,f),removeListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);}}};
 const row={kind:'image',body:'data:image/png;base64,AA==',who:'test-wallet',__txSignature:'2'.repeat(88)};
 w.iqCodein={hasOwnRpc:()=>false,estimateCost:()=>({chunks:1,total:1}),readBoard:async()=>({rows:boardRows}),readMine:async()=>({rows:[row]}),viewUrl:s=>'https://iqlabs.dev/?menu=codein&post='+s,metaUrl:s=>'https://gateway.iqlabs.dev/token-meta/'+s,connect:()=>({}),deriveBurner:async()=>({}),inscribeMeta:async()=>{metadata++;return {sig:'meta'};},inscribe:async()=>{registrations++;return {sig:'registry'};},notify:async()=>{},imgUrl:s=>'https://gateway.iqlabs.dev/img/'+s,renderUrl:s=>'https://gateway.iqlabs.dev/render/'+s,market:{enrich:async()=>[],embedUrl:()=>'',siteUrl:()=>'',tradeUrl:()=>'',tradeLabel:'Pump',siteLabel:'DEX',attribution:'test'},getSpeed:()=> 'light'};
 w.iqTokenLaunch={GATEWAY:'https://gateway.iqlabs.dev',FEE_SOL:.069,launch:async()=>{launches++;return {mint:'mint',sig:'create'};}};
 if (evm) w.iqCodeinChains={evm:{...w.iqCodein,meta:{boardTitle:'HOOD IN',connLabel:'Robinhood RPC',scanLabel:'EXPLORER',maxSigs:25},getWallets:()=>[],getWalletProvider:()=>null,...evm}};
 w.$.ajax=({success})=>success(fs.readFileSync(path.resolve(__dirname, '../assets/html/sections/code_in_v2.html'),'utf8'));
 w.eval(fs.readFileSync(path.resolve(__dirname, '../assets/js/sections/pages/code_in_v2.js'),'utf8'));w.$.code_in_v2.init(null,evm?'evm':'solana');await tick();
 return {w,calls,listeners,counts:()=>({metadata,launches,registrations})};
}
test('trusted reconnect restores UI without signing and disconnect invalidates it',async t=>{
 const v=await mount(t);assert.deepEqual(JSON.parse(JSON.stringify(v.calls)),[{onlyIfTrusted:true}]);
 assert.equal(v.w.$('#ci2_connect').hasClass('hide'),true);assert.deepEqual(v.counts(),{metadata:0,launches:0,registrations:0});
 v.listeners.get('disconnect')();assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
});
test('untrusted wallet remains disconnected without interactive fallback',async t=>{
 const v=await mount(t,async()=>{throw Error('not authorized');});assert.equal(v.calls.length,1);assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
});
test('late trusted response cannot overwrite an account-change event',async t=>{
 let finish;const v=await mount(t,()=>new Promise(r=>{finish=r;}));v.listeners.get('accountChanged')();finish({publicKey:{toString:()=> 'old-wallet'}});await tick();assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
});
test('upstream launch registration completes before success and cannot be repeated',async t=>{
 const v=await mount(t),$=v.w.$;
 $('#ci2_mk_launch').trigger('click');await tick();$('#ci2_tk_inv .rec').first().trigger('click');$('#ci2_tk_continue').trigger('click');
 $('#ci2_tk_name').val('Test');$('#ci2_tk_symbol').val('TEST');$('#ci2_tk_go').trigger('click');await tick();await tick();
 assert.deepEqual(v.counts(),{metadata:1,launches:1,registrations:1});
 assert.match($('#ci2_tk_regnote').text(),/registered on chain/);
 $('#ci2_tk_reg_retry').trigger('click');$('#ci2_tk_reg_retry').trigger('click');await tick();await tick();
 assert.deepEqual(v.counts(),{metadata:1,launches:1,registrations:1});
});

test('linked coins reuse the chart action without wallet or transaction links',async t=>{
 const src='2'.repeat(88);
 const row={kind:'token',body:JSON.stringify({mint:'3'.repeat(44),name:'<b>Example</b>',symbol:'DEMO',src})};
 const v=await mount(t,undefined,[row,row]);
 v.w.iqCodein.readOne=async()=>({kind:'text',body:'original',who:'test-wallet'});
 v.w.iqCodein.market.enrich=async()=>[{mint:'3'.repeat(44),priceUsd:'1',embed:'https://www.geckoterminal.com/solana/pools/test?embed=1',url:'https://www.geckoterminal.com/solana/pools/test',via:'via geckoterminal',siteLabel:'OPEN ON GECKOTERMINAL'}];
 v.w.$.code_in_v2.init(src);await tick();await tick();
 const box=v.w.$('#ci2_view_coins');assert.match(box.text(),/1 linked coin/);assert.equal(box.find('a,b').length,0);
 box.find('button').trigger('click');assert.equal(v.w.$('#ci2_chart_modal').hasClass('hide'),false);
 assert.equal(v.w.$('#ci2_chart_box iframe').attr('src'),'https://www.geckoterminal.com/solana/pools/test?embed=1');
 assert.equal(v.w.$('#ci2_chart_dexs').text(),'OPEN ON GECKOTERMINAL');
 assert.deepEqual(v.counts(),{metadata:0,launches:0,registrations:0});
});

for (const outcome of ['ok', 'unavailable', 'throws']) test(`confirmed registration survives notify ${outcome} without another write or board scan`, async t => {
 const v = await mount(t), $ = v.w.$;
 let reads = 0, notifications = 0;
 v.w.iqCodein.readBoard = async () => { reads++; return {rows: []}; };
 v.w.iqCodein.notify = async () => {
  notifications++;
  if (outcome === 'throws') throw Error('gateway unavailable');
  return outcome === 'ok';
 };
 $('#ci2_mk_launch').trigger('click'); await tick();
 $('#ci2_tk_inv .rec').first().trigger('click'); $('#ci2_tk_continue').trigger('click');
 $('#ci2_tk_name').val('Test'); $('#ci2_tk_symbol').val('TEST'); $('#ci2_tk_go').trigger('click');
 await tick(); await tick();
 $('#ci2_tk_reg_retry').trigger('click'); await tick(); await tick();
 assert.equal(v.counts().registrations, 1);
 assert.equal(notifications, 1);
 assert.equal(reads, 0);
 assert.match($('#ci2_tk_regnote').text(), /registered on chain/);
 assert.match($('#ci2_tk_coins').text(), /1 linked coin/);
 assert.equal($('#ci2_tk_reg_retry').hasClass('hide'), true);
 $('#ci2_tk_reg_retry').trigger('click'); await tick();
 assert.equal(v.counts().registrations, 1);
 assert.equal(notifications, 1);
});

test('confirmed post remains visible with a stale gateway and rejected notification',async t=>{
 const v=await mount(t),$=v.w.$;
 v.w.iqCodein.notify=async()=>{throw Error('gateway offline');};
 $('#ci2_new').trigger('click');$('#ci2_text').val('confirmed post');$('#ci2_go').trigger('click');
 await tick();await tick();
 assert.equal(v.counts().registrations,1);
 assert.equal($('#ci2_done').hasClass('hide'),false);
 $('#ci2_view').trigger('click');await tick();
 assert.match($('#ci2_grid').text(),/confirmed post/);
 assert.equal(v.counts().registrations,1);
});

for (const healthy of [false, true]) test(`trusted EVM restore checks RPC before enabling writes (healthy: ${healthy})`, async t => {
 let finish;
 const check = new Promise(resolve => { finish = resolve; });
 const v = await mount(t, undefined, [], {
  connectWallet: async options => { assert.equal(options.onlyIfTrusted, true); return 'test-wallet'; },
  checkWalletRpc: () => check
 });
 assert.equal(v.w.$('#ci2_connect').hasClass('hide'), false);
 assert.deepEqual(v.counts(), {metadata:0,launches:0,registrations:0});
 finish({ok:healthy,reason:'not responding'}); await tick();
 assert.equal(v.w.$('#ci2_connect').hasClass('hide'), healthy);
 assert.equal(v.w.$('#ci2_rpcwarn').hasClass('hide'), healthy);
 assert.deepEqual(v.counts(), {metadata:0,launches:0,registrations:0});
});

for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) {
 for (const restoring of [true, false]) test(`EVM ${restoring?'restore':'connect'} stays disconnected after ${event} during RPC preflight`,async t=>{
  const listeners=new Map();let finish,disconnected=0;
  const walletProvider={on:(name,handler)=>listeners.set(name,handler),removeListener:(name,handler)=>{if(listeners.get(name)===handler)listeners.delete(name);}};
  const v=await mount(t,undefined,[],{
   getWallets:()=>[{id:'metamask',name:'MetaMask',selected:true}],getWalletProvider:()=>walletProvider,
   connectWallet:async options=>options.onlyIfTrusted&&!restoring?null:'0xabc',
   checkWalletRpc:()=>new Promise(resolve=>{finish=resolve;}),disconnectWallet:()=>{disconnected++;}
  });
  if(!restoring){v.w.$('#ci2_connect').trigger('click');v.w.document.getElementById('ci2_wallet_dialog').close('metamask');await tick();}
  assert.equal(typeof listeners.get(event),'function');listeners.get(event)();
  finish({ok:true});await tick();
  assert.equal(disconnected,1);assert.equal(v.w.$('#ci2_connect').hasClass('hide'),false);
  assert.equal(v.w.$('#ci2_new').hasClass('hide'),true);
  assert.equal(v.w.$('#ci2_who').text(),'');
 });
}

test('confirmed post retains the submitted author when the wallet changes during the write',async t=>{
 const v=await mount(t),$=v.w.$;let finish;const notifications=[];
 v.w.iqCodein.inscribe=()=>new Promise(resolve=>{finish=resolve;});
 v.w.iqCodein.notify=async(sig,row)=>{notifications.push({sig,row});};
 $('#ci2_new').trigger('click');$('#ci2_text').val('original author');$('#ci2_go').trigger('click');await tick();
 v.listeners.get('accountChanged')();finish({sig:'confirmed-post'});await tick();await tick();
 assert.equal(notifications.length,1);assert.equal(notifications[0].row.who,'test-wallet');
 assert.equal($('#ci2_done').hasClass('hide'),false);assert.equal($('#ci2_retry').hasClass('hide'),true);
 $('#ci2_view').trigger('click');await tick();
 assert.match($('#ci2_grid').text(),/original author/);assert.equal($('#ci2_grid .own').first().text(),'test...llet');
});

test('confirmed registry notification retains the submitted author after disconnect',async t=>{
 const v=await mount(t),$=v.w.$;let finish,writes=0;const notifications=[];
 v.w.iqCodein.inscribe=()=>{writes++;return new Promise(resolve=>{finish=resolve;});};
 v.w.iqCodein.notify=async(sig,row)=>{notifications.push({sig,row});};
 $('#ci2_mk_launch').trigger('click');await tick();$('#ci2_tk_inv .rec').first().trigger('click');$('#ci2_tk_continue').trigger('click');
 $('#ci2_tk_name').val('Test');$('#ci2_tk_symbol').val('TEST');$('#ci2_tk_go').trigger('click');await tick();
 v.listeners.get('disconnect')();finish({sig:'confirmed-registry'});await tick();await tick();
 assert.equal(notifications.length,1);assert.equal(notifications[0].row.who,'test-wallet');
 assert.match($('#ci2_tk_regnote').text(),/registered on chain/);
 $('#ci2_tk_reg_retry').trigger('click');await tick();assert.equal(writes,1);
});

test('a confirmed Retry reuses its result while a fresh identical composition writes again',async t=>{
 const v=await mount(t),$=v.w.$;let writes=0;
 v.w.iqCodein.inscribe=async()=>({sig:'confirmed-'+(++writes)});
 v.w.iqCodein.notify=()=>{throw Error('synchronous notification failure');};
 $('#ci2_new').trigger('click');$('#ci2_text').val('same content');$('#ci2_go').trigger('click');await tick();await tick();
 assert.equal($('#ci2_done').hasClass('hide'),false);assert.equal($('#ci2_retry').hasClass('hide'),true);
 $('#ci2_retry').trigger('click');await tick();assert.equal(writes,1);
 $('#ci2_again').trigger('click');$('#ci2_go').trigger('click');await tick();await tick();
 assert.equal(writes,2);assert.match($('#ci2_sig').text(),/confirmed-2/);
});

test('EVM compose displays adapter stages and keeps the confirmed result for Retry',async t=>{
 let finish,operation,writes=0;
 const v=await mount(t,undefined,[],{
  connectWallet:async()=> '0xabc',checkWalletRpc:async()=>({ok:true}),
  inscribe:args=>{writes++;operation=args;return new Promise(resolve=>{finish=resolve;});}
 });
 const $=v.w.$;$('#ci2_new').trigger('click');$('#ci2_text').val('hybrid progress');$('#ci2_go').trigger('click');await tick();
 assert.equal(typeof operation.onStatus,'function');assert.equal(operation.onProgress,undefined);
 operation.onStatus(45,'uploading 1/2 batches');assert.equal($('#ci2_bar')[0].style.width,'45%');
 assert.equal($('#ci2_pct').text(),'uploading 1/2 batches');
 operation.onStatus(95,'final signature 2/2 - approve in your wallet');assert.equal($('#ci2_bar')[0].style.width,'95%');
 assert.match($('#ci2_pct').text(),/final signature 2\/2/);
 finish({sig:'0xprogress'});await tick();await tick();$('#ci2_retry').trigger('click');await tick();
 assert.equal(writes,1);assert.equal($('#ci2_done').hasClass('hide'),false);
});

test('upstream file notices and file/audio token sources remain available',async t=>{
 const signature='4'.repeat(88);
 const file={kind:'file',body:'data:application/octet-stream;name=notes.txt;base64,AA==',who:'test-wallet',__txSignature:signature};
 const audio={kind:'file',body:'data:audio/wav;name=track.wav;base64,AA==',who:'test-wallet',__txSignature:'5'.repeat(88)};
 const v=await mount(t,undefined,[file]),$=v.w.$;
 $('#ci2_grid .rec').first().trigger('click');await tick();
 assert.equal($('#ci2_view_file_notice').hasClass('hide'),false);assert.match($('#ci2_view_file_notice').text(),/be careful/);
 assert.equal($('#ci2_view_token').hasClass('hide'),false);
 $('#ci2_view_close').trigger('click');
 v.w.iqCodein.readMine=async()=>({rows:[file,audio,{kind:'token',body:'registry',__txSignature:'token'}]});
 $('#ci2_mk_launch').trigger('click');await tick();
 assert.equal($('#ci2_tk_inv .rec').length,2);assert.equal($('#ci2_tk_inv .rec.dim').length,0);
 assert.match($('#ci2_tk_inv').text(),/notes.txt/);assert.match($('#ci2_tk_inv').text(),/audio/);
 $('#ci2_tk_inv .rec').last().trigger('click');assert.equal($('#ci2_tk_continue').prop('disabled'),false);
});
