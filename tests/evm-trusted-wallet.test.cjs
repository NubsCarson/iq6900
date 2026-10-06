const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
for(const [accounts,chain,expected] of [[[],'0x1237',null],[['0xabc'],'0x1',null],[['0xabc'],'0x1237','0xabc']]){
 test(`trusted EVM restore: accounts=${accounts.length}, chain=${chain}`,async()=>{
  const calls=[];
  const window=Object.assign(new EventTarget(),{ethereum:{request:async({method})=>{calls.push(method);if(method==='eth_accounts')return accounts;if(method==='eth_chainId')return chain;throw Error('Interactive request forbidden: '+method);}}});
  const context=vm.createContext({window,localStorage:{getItem:()=>null},console,setTimeout,clearTimeout,AbortController,Event,TextEncoder});
  const mod=new vm.SourceTextModule(fs.readFileSync(path.resolve(__dirname, '../assets/js/codein/evm.js'),'utf8'),{context});
  await mod.link(name=>{
   const values=name.includes('ascii.js')?{toAscii:()=>''}:name.includes('market.js')?{marketRows:async()=>[]}:name.includes('ethers@')?{BrowserProvider:class{async getSigner(){return {address:accounts[0]};}},JsonRpcProvider:class{},Wallet:class{},parseEther:()=>0n,keccak256:()=>'',toUtf8Bytes:x=>x,formatEther:()=> '0'}:{setNetwork(){},utils:{getBasicFee:async()=>0n,getLinkedListFee:async()=>0n}};
   return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
  });
  await mod.evaluate();assert.equal(await window.iqCodeinChains.evm.connectWallet({onlyIfTrusted:true}),expected);
  assert.ok(calls.every(x=>['eth_accounts','eth_chainId'].includes(x)));
 });
}

async function setupWallets(balance = 0n) {
 const calls=[], writes=[], transfers=[]; let writeError=null, writeResult=null, writeHandler=null;let funds=0;
 const window=new EventTarget();
 const phantom={request:async ({method})=>{calls.push(['phantom',method]);throw Error('Wrong wallet');}};
 const metamask={request:async({method})=>{
  calls.push(['metamask',method]);
  if(method==='eth_accounts'||method==='eth_requestAccounts')return ['0xabc'];
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_blockNumber')return '0x100';
  if(method==='wallet_switchEthereumChain')return null;
  throw Error(method);
 }};
 window.ethereum=phantom;
 const store=new Map();
 const context=vm.createContext({window,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},console,setTimeout,clearTimeout,AbortController,Event,TextEncoder});
 const mod=new vm.SourceTextModule(fs.readFileSync(path.resolve(__dirname, '../assets/js/codein/evm.js'),'utf8'),{context});
 await mod.link(name=>{
  const values=name.includes('ascii.js')?{toAscii:()=>''}:name.includes('market.js')?{marketRows:async()=>[]}:name.includes('ethers@')?{
   BrowserProvider:class {constructor(p){assert.equal(p,metamask);} async getSigner(){return {address:'0xabc',provider:this,async getAddress(){return this.address;},signMessage:async()=> 'fixture-signature',async sendTransaction(tx){assert.equal(this.address,'0xabc');transfers.push(tx);funds++;return {wait:async()=>{}}}};} async getBalance(){return balance;}},
   JsonRpcProvider:class {async getBlockNumber(){return 256;}async getBalance(){return 0n;}async getFeeData(){return {gasPrice:1n};}},Wallet:class {constructor(key,provider){this.provider=provider;this.address='burner';}},parseEther:x=>BigInt(Math.round(Number(x)*1e18)),keccak256:()=> 'fixture-key',toUtf8Bytes:x=>x,formatEther:n=>String(Number(n)/1e18)
  }:{setNetwork(){},utils:{getBasicFee:async()=>120000000000000n,getLinkedListFee:async()=>360000000000000n},writer:{writeRowWithInventory:async(...args)=>{writes.push(args);if(writeError)throw writeError;if(writeHandler)return writeHandler(...args);return writeResult || {boardTx:'0xtx'};}}};
  return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v] of Object.entries(values))this.setExport(k,v);},{context});
 });
 await mod.evaluate();
 for(const [id,p] of [['app.phantom',phantom],['io.metamask',metamask]]){
  const event=new Event('eip6963:announceProvider');event.detail={info:{rdns:id,name:id==='io.metamask'?'MetaMask':'Phantom'},provider:p};window.dispatchEvent(event);
 }
 return {surface:window.iqCodeinChains.evm,calls,writes,transfers,metamask,setWriteError:e=>{writeError=e;},setWriteResult:r=>{writeResult=r;},setWriteHandler:h=>{writeHandler=h;},funds:()=>funds};
}
test('selecting MetaMask ignores Phantom global for connection and health check',async()=>{
 const {surface,calls,metamask}=await setupWallets();
 assert.equal(surface.getWallets().length,2);
 assert.equal(await surface.connectWallet({onlyIfTrusted:true}),null);
 assert.equal(calls.length,0);
 await surface.connectWallet({walletId:'io.metamask'});
 assert.equal(surface.getWalletProvider(),metamask);
 assert.equal((await surface.checkWalletRpc()).ok,true);
 assert.ok(calls.every(([wallet])=>wallet==='metamask'));
});
test('zero native balance blocks hybrid SDK write and funding transfer',async()=>{
 const {surface,calls,writes}=await setupWallets();await surface.connectWallet({walletId:'io.metamask'});
 calls.length=0;
 await assert.rejects(surface.inscribe({kind:'text',body:'test',who:'0xabc'}),/not enough ETH/);
 assert.equal(writes.length,0);
 assert.ok(calls.every(([,method])=>['eth_accounts','eth_chainId'].includes(method)));
});
test('funded selected account reaches SDK, stale displayed account does not',async()=>{
 const {surface,writes}=await setupWallets(1000000000000000000n);await surface.connectWallet({walletId:'io.metamask'});
 await assert.rejects(surface.inscribe({kind:'text',body:'test',who:'0xdef'}),/account or network changed/);
 assert.equal(writes.length,0);
 assert.equal((await surface.inscribe({kind:'text',body:'test',who:'0xabc'})).sig,'0xtx');
 assert.equal(writes.length,1);
});

test('disconnect clears signer and suppresses silent reconnect until explicit selection',async()=>{
 const {surface,calls}=await setupWallets();
 await surface.connectWallet({walletId:'io.metamask'});
 surface.disconnectWallet();calls.length=0;
 assert.equal(surface.getWalletProvider(),null);
 assert.equal(await surface.connectWallet({onlyIfTrusted:true}),null);
 assert.equal(calls.length,0);
 await assert.rejects(surface.inscribe({kind:'text',body:'test',who:'0xabc'}),/connect the wallet first/);
 assert.equal(await surface.connectWallet({walletId:'io.metamask'}),'0xabc');
});


test('upstream retry checkpoint survives and is scoped to the exact inscription',async()=>{
 const v=await setupWallets(1000000000000000000n);await v.surface.connectWallet({walletId:'io.metamask'});
 const checkpoint={beforeTx:'0xprior',sentChunks:2};v.setWriteError(Object.assign(Error('interrupted'),{checkpoint}));
 await assert.rejects(v.surface.inscribe({kind:'text',body:'same',who:'0xabc'}),/interrupted/);
 v.setWriteError(null);await v.surface.inscribe({kind:'text',body:'same',who:'0xabc'});
 assert.equal(v.writes[1][5].resume,checkpoint);
 await v.surface.inscribe({kind:'text',body:'different',who:'0xabc'});
 assert.equal(v.writes[2][5].resume,undefined);
});

test('a confirmed hybrid write returns success after disconnect and allows a fresh identical write',async()=>{
 const v=await setupWallets(1000000000000000000n);await v.surface.connectWallet({walletId:'io.metamask'});
 let finish;v.setWriteResult(new Promise(resolve=>{finish=resolve;}));
 const inscription={kind:'text',body:'confirmed while disconnected',who:'0xabc'};
 const pending=v.surface.inscribe(inscription);
 while(!v.writes.length)await new Promise(setImmediate);
 const submittedSigner=v.writes[0][1];
 v.surface.disconnectWallet();finish({boardTx:'0xconfirmed'});
 const confirmed=await pending;
 assert.equal(confirmed.sig,'0xconfirmed');assert.equal(submittedSigner.address,'0xabc');
 assert.equal(v.surface.getWalletProvider(),null);
 assert.equal(await v.surface.connectWallet({onlyIfTrusted:true}),null);
 await v.surface.connectWallet({walletId:'io.metamask'});
 assert.equal(v.writes.length,1);assert.equal(v.funds(),1);
 v.setWriteResult(null);await v.surface.inscribe(inscription);
 assert.equal(v.writes.length,2);assert.equal(v.writes[1][5].resume,undefined);
});

test('a late interrupted write cannot restore a checkpoint into a new wallet session',async()=>{
 const v=await setupWallets(1000000000000000000n);await v.surface.connectWallet({walletId:'io.metamask'});
 let fail;v.setWriteResult(new Promise((_,reject)=>{fail=reject;}));
 const inscription={kind:'text',body:'interrupted session',who:'0xabc'};
 const pending=v.surface.inscribe(inscription);
 while(!v.writes.length)await new Promise(setImmediate);
 v.surface.disconnectWallet();await v.surface.connectWallet({walletId:'io.metamask'});
 fail(Object.assign(Error('interrupted'),{checkpoint:{beforeTx:'0xold-session'}}));
 await assert.rejects(pending,/interrupted/);
 v.setWriteResult(null);await v.surface.inscribe(inscription);
 assert.equal(v.writes[1][5].resume,undefined);
});

test('disconnect during account approval cannot restore the cleared wallet session',async()=>{
 const v=await setupWallets();const request=v.metamask.request;
 let finish;const wait=new Promise(resolve=>{finish=resolve;});
 v.metamask.request=async args=>{if(args.method==='eth_requestAccounts')await wait;return request(args);};
 const pending=v.surface.connectWallet({walletId:'io.metamask'});
 v.surface.disconnectWallet();finish();
 await assert.rejects(pending,/account or network changed/);
 assert.equal(v.surface.getWalletProvider(),null);
 assert.equal(await v.surface.connectWallet({onlyIfTrusted:true}),null);
});

test('disconnect during write preflight prevents funding and SDK submission',async()=>{
 const v=await setupWallets(1000000000000000000n);await v.surface.connectWallet({walletId:'io.metamask'});
 const request=v.metamask.request;let finish;
 v.metamask.request=async args=>{if(args.method==='eth_accounts')await new Promise(resolve=>{finish=resolve;});return request(args);};
 const pending=v.surface.inscribe({kind:'text',body:'stale preflight',who:'0xabc'});
 v.surface.disconnectWallet();finish();
 await assert.rejects(pending,/account or network changed/);
 assert.equal(v.writes.length,0);assert.equal(v.funds(),0);
});

test('a wallet RPC health response cannot approve a disconnected session',async()=>{
 const v=await setupWallets();await v.surface.connectWallet({walletId:'io.metamask'});
 const request=v.metamask.request;let finish;
 v.metamask.request=async args=>{if(args.method==='eth_blockNumber')await new Promise(resolve=>{finish=resolve;});return request(args);};
 const pending=v.surface.checkWalletRpc();v.surface.disconnectWallet();finish();
 assert.equal((await pending).ok,false);assert.equal(v.surface.getWalletProvider(),null);
});

test('hybrid progress observes both final transactions through the captured signer after disconnect',async()=>{
 const v=await setupWallets(1000000000000000000n);await v.surface.connectWallet({walletId:'io.metamask'});
 let finish;const wait=new Promise(resolve=>{finish=resolve;});const statuses=[],progress=[];
 v.setWriteHandler(async(burner,observedSigner,db,table,row,options)=>{
  await wait;
  assert.equal(observedSigner.address,'0xabc');assert.equal(await observedSigner.getAddress(),'0xabc');
  options.onProgress(50);options.onProgress(100);
  for(const to of ['inventory','inventory-tail']){const tx=await observedSigner.sendTransaction({to});await tx.wait();}
  return {boardTx:'0xprogress'};
 });
 const pending=v.surface.inscribe({kind:'text',body:'A'.repeat(1000),who:'0xabc',onProgress:pct=>progress.push(pct),onStatus:(pct,label)=>statuses.push({pct,label})});
 while(!v.writes.length)await new Promise(setImmediate);
 v.surface.disconnectWallet();finish();
 assert.equal((await pending).sig,'0xprogress');assert.equal(v.surface.signer,null);
 assert.deepEqual(progress,[50,100]);
 assert.deepEqual(statuses.map(status=>status.pct),[0,2,3,6,10,45,80,85,90,95,98,100]);
 assert.match(statuses.at(-1).label,/all transactions confirmed/);
 assert.deepEqual(v.transfers.map(tx=>tx.to),['burner','inventory','inventory-tail']);
 assert.equal(v.writes.length,1);
});

test('resumed hybrid finalization observes only the remaining wallet transaction',async()=>{
 const v=await setupWallets(1000000000000000000n);await v.surface.connectWallet({walletId:'io.metamask'});
 const checkpoint={onChainPath:[],inventoryTx:'0xinventory'};
 v.setWriteError(Object.assign(Error('interrupted'),{checkpoint}));
 const inscription={kind:'text',body:'resumed finalization',who:'0xabc'};
 await assert.rejects(v.surface.inscribe(inscription),/interrupted/);v.setWriteError(null);
 const statuses=[];
 v.setWriteHandler(async(burner,observedSigner,db,table,row,options)=>{
  assert.equal(options.resume,checkpoint);
  const tx=await observedSigner.sendTransaction({to:'remaining-tail'});await tx.wait();
  return {boardTx:'0xresumed'};
 });
 assert.equal((await v.surface.inscribe({...inscription,onStatus:(pct,label)=>statuses.push({pct,label})})).sig,'0xresumed');
 assert.ok(statuses.some(status=>status.pct===80&&/already complete/.test(status.label)));
 assert.ok(statuses.some(status=>status.pct===95&&/final signature 2\/2/.test(status.label)));
 assert.equal(statuses.some(status=>/final signature 1\/2/.test(status.label)),false);
 assert.deepEqual(v.transfers.slice(-1).map(tx=>tx.to),['remaining-tail']);
});
