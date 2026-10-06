const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const jquery = require('jquery');
const assets = path.resolve(__dirname, '../assets');
const requestId = 'e97c120e-3525-4b9f-95b7-277145e8ef4c';
const signatures = { solana: '2'.repeat(88), evm: '0x' + 'a'.repeat(64) };
const tick = () => new Promise(setImmediate);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

// Only the page script and template are real. Adapters/wallets are controlled
// fixtures: a write-sink call is routing evidence, never a paid-chain receipt.
async function mount(t, opts = {}) {
  const initialChain = opts.initialChain || 'solana';
  const url = new URL(opts.base || 'https://iqlabs.dev/');
  url.searchParams.set('menu', initialChain === 'evm' ? 'hoodin' : 'codein');
  if (opts.attached !== false) {
    url.searchParams.set('attachmentOrigin', opts.origin || 'https://blockchan.sol.site');
    url.searchParams.set('attachmentRequest', opts.requestId || requestId);
  }
  const dom = new JSDOM('<div id="main_section"></div>', { url: url.href, runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.$ = w.jQuery = jquery(w); w.TextEncoder = TextEncoder;
  const sent = [], alerts = [], writes = [], connects = [], notifications = [], notificationRows = [], boards = [];
  const listeners = new Map();
  const walletProvider = { on: (event, handler) => listeners.set(event, handler),
    removeListener: (event, handler) => { if (listeners.get(event) === handler) listeners.delete(event); } };
  w.HTMLDialogElement.prototype.close = function(value) { this.returnValue = value; this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLDialogElement.prototype.showModal = function() { this.open = true; this.close('fixture-evm'); };
  w.alert = message => alerts.push(message); w.console.error = () => {};
  w.opener = opts.noOpener ? null : { closed: false,
    postMessage: (data, target) => sent.push({ data: JSON.parse(JSON.stringify(data)), target }) };
  w.phantom = { solana: { ...walletProvider, publicKey: { toString: () => 'local-user' }, connect: async (options = {}) => {
    if (options.onlyIfTrusted) return null;
    connects.push('solana'); if (opts.walletPending) await opts.walletPending.promise;
    return { publicKey: 'local-user' };
  } } };
  const adapters = {};
  for (const chain of ['solana', 'evm']) adapters[chain] = {
    cluster: opts.cluster || 'mainnet-beta',
    meta: { boardTitle: 'HOOD IN', connLabel: 'connection: Robinhood RPC', scanLabel: 'BLOCKSCOUT', maxSigs: 25 },
    imgUrl: sig => 'https://gateway.iqlabs.dev/img/' + sig, renderUrl: sig => 'https://gateway.iqlabs.dev/render/' + sig,
    market: { enrich: async () => [] }, hasOwnRpc: () => false,
    estimateCost: () => ({ sigs: 2, chunks: 1, total: 1, totalLabel: '0.0001 ETH' }),
    viewUrl: sig => `https://iqlabs.dev/?menu=${chain === 'evm' ? 'hoodin' : 'codein'}&post=${sig}`,
    readBoard: async () => { boards.push(chain); return { rows: [] }; },
    getSpeed: () => 'auto', recommendSpeed: () => 'light', connect: () => ({}),
    deriveBurner: async () => { if (opts.burnerPending) await opts.burnerPending.promise; return {}; }, sweep: async () => 0,
    getWallets: () => [{ id: 'fixture-evm', name: 'Fixture wallet', selected: true }],
    getWalletProvider: () => walletProvider, disconnectWallet: () => {},
    connectWallet: async (options = {}) => {
      if (options.onlyIfTrusted) return null;
      assert.equal(options.walletId, 'fixture-evm');
      connects.push('evm'); if (opts.walletPending) await opts.walletPending.promise; return '0x' + 'b'.repeat(40);
    },
    checkWalletRpc: async () => opts.healthPending ? opts.healthPending.promise : { ok: true },
    inscribe: async args => {
      if (chain === 'evm' && opts.statusStages) for (const [percent, label] of opts.statusStages) args.onStatus(percent, label);
      writes.push({ chain, args }); if (opts.writePending) await opts.writePending.promise;
      if (opts.fail) throw new Error('fixture upload rejected'); return { sig: signatures[chain] };
    },
    notify: async (sig, row) => { notifications.push({ chain, sig }); notificationRows.push(row); if (opts.notifyPending) return opts.notifyPending.promise; return false; },
  };
  w.iqCodeinChains = adapters; w.iqCodein = adapters.solana;
  w.$.ajax = ({ success }) => success(fs.readFileSync(path.join(assets, 'html/sections/code_in_v2.html'), 'utf8'));
  w.eval(fs.readFileSync(path.join(assets, 'js/sections/pages/code_in_v2.js'), 'utf8'));
  w.$.code_in_v2.init(null, initialChain); await tick();
  async function pickFile(type = 'audio/wav', name = 'my track; #1 (live).wav', result) {
    if (result) w.FileReader = class { readAsDataURL() { this.result = result; this.onload(); } };
    const input = w.document.querySelector('#ci2_file_file');
    Object.defineProperty(input, 'files', { configurable: true, value: [new w.File([new Uint8Array([1, 2, 3])], name, { type })] });
    w.$(input).trigger('change'); await pause(20);
  }
  async function upload() { w.$('#ci2_go').trigger('click'); await pause(20); }
  return { w, sent, alerts, writes, connects, notifications, notificationRows, listeners, boards, adapters, pickFile, upload };
}

for (const [origin, chain] of [
  ['https://blockchan.sol.site', 'solana'], ['https://blockchan.ar.io', 'solana'], ['https://hoodchan.xyz', 'evm'],
]) test(`${origin} pins mismatched initial route and returns only its expected network`, async t => {
  const f = await mount(t, { origin, initialChain: chain === 'evm' ? 'solana' : 'evm' });
  assert.equal(f.w.iqCodein, f.adapters[chain]);
  assert.equal(new URL(f.w.location.href).searchParams.get('menu'), chain === 'evm' ? 'hoodin' : 'codein');
  assert.equal(f.w.$('#ci2_xchain').prop('disabled'), true); assert.equal(f.sent[0].data.type, 'iq:attachment-ready');
  await f.pickFile(); await f.upload();
  assert.deepEqual(f.writes.map(write => write.chain), [chain]);
  assert.deepEqual(f.sent[1], { target: origin, data: { type: 'iq:attachment-complete', requestId,
    network: chain === 'evm' ? 'robinhood' : 'solana', signature: signatures[chain] } });
  assert.equal(f.w.$('#ci2_tx_id').val(), signatures[chain]);
  assert.equal(f.w.$('#ci2_share_link').val(), f.adapters[chain].viewUrl(signatures[chain]));
  assert.equal(f.w.$('#ci2_open_link').attr('href'), f.w.$('#ci2_share_link').val());
  assert.equal(f.boards.length, 0, 'attachment upload does not fetch the public feed');
  assert.match(f.writes[0].args.body, /^data:audio\/wav;name=my%20track%3B%20%231%20\(live\).wav;base64,/);
});

for (const chain of ['solana', 'evm']) test(`${chain} attachment cannot hop chains after closing compose`, async t => {
  const f = await mount(t, { initialChain: chain, origin: chain === 'evm' ? 'https://hoodchan.xyz' : undefined });
  f.w.$('#ci2_close').trigger('click'); f.w.$('#ci2_xchain').trigger('click');
  f.w.$.code_in_v2.init(null, chain === 'evm' ? 'solana' : 'evm');
  assert.equal(f.w.iqCodein, f.adapters[chain]); assert.equal(f.w.$('#ci2').hasClass('hood'), chain === 'evm');
  await f.pickFile('image/png'); await f.upload();
  assert.deepEqual(f.writes.map(write => write.chain), [chain]); assert.deepEqual(f.connects, [chain]);
});

test('standalone cross-chain header still switches adapters and route', async t => {
  const f = await mount(t, { attached: false }); assert.equal(f.w.$('#ci2_xchain').prop('disabled'), false);
  f.w.$('#ci2_xchain').trigger('click'); await tick();
  assert.equal(f.w.iqCodein, f.adapters.evm); assert.equal(new URL(f.w.location.href).searchParams.get('menu'), 'hoodin');
  await f.pickFile(); await f.upload(); assert.deepEqual(f.writes.map(write => write.chain), ['evm']);
  assert.equal(f.sent.length, 0); assert.equal(f.w.$('#ci2_tx_id').val(), signatures.evm);
});

test('Hood attachment forwards upstream hybrid stages to the shared progress bar', async t => {
  const writePending = deferred();
  const f = await mount(t, { origin: 'https://hoodchan.xyz', initialChain: 'evm', writePending,
    statusStages: [[3, 'funding - approve the transfer in your wallet'], [80, 'upload complete - saving board record']] });
  await f.pickFile(); await f.upload();
  assert.equal(f.w.$('#ci2_pct').text(), 'upload complete - saving board record');
  assert.equal(f.w.$('#ci2_bar')[0].style.width, '80%');
  assert.equal(f.writes.length, 1); assert.equal(f.sent.length, 1);
  writePending.resolve(); await pause(20);
  assert.equal(f.sent[1].data.network, 'robinhood');
  assert.equal(f.w.$('#ci2_launch_after').hasClass('hide'), false, 'upstream file/audio token source remains available');
});

for (const change of ['route', 'adapter', 'cluster']) test(`attachment rejects a changed ${change} before wallet connection`, async t => {
  const f = await mount(t); await f.pickFile('image/png');
  if (change === 'route') f.w.history.replaceState({}, '', '?menu=hoodin');
  if (change === 'adapter') f.w.iqCodein = f.adapters.evm;
  if (change === 'cluster') f.adapters.solana.cluster = 'devnet';
  await f.upload(); assert.equal(f.connects.length, 0); assert.equal(f.writes.length, 0);
  assert.equal(f.alerts.length, 1); assert.equal(f.sent.length, 1);
});

for (const chain of ['solana', 'evm']) for (const change of ['route', 'adapter'])
  test(`${chain} checks a changed ${change} after pending wallet connection`, async t => {
    const walletPending = deferred();
    const f = await mount(t, { walletPending, initialChain: chain, origin: chain === 'evm' ? 'https://hoodchan.xyz' : undefined });
    await f.pickFile(); await f.upload(); assert.deepEqual(f.connects, [chain]); assert.equal(f.writes.length, 0);
    if (change === 'route') f.w.history.replaceState({}, '', '?menu=' + (chain === 'evm' ? 'codein' : 'hoodin'));
    else f.w.iqCodein = f.adapters[chain === 'evm' ? 'solana' : 'evm'];
    walletPending.resolve(); await pause(20);
    assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 1); assert.equal(f.alerts.length, 1);
  });

test('Solana checks the network again after pending burner derivation, before funding', async t => {
  const burnerPending = deferred(); const f = await mount(t, { burnerPending });
  await f.pickFile(); await f.upload(); assert.equal(f.writes.length, 0);
  f.w.history.replaceState({}, '', '?menu=hoodin'); burnerPending.resolve(); await pause(20);
  assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 1); assert.equal(f.w.$('#ci2_compose').hasClass('hide'), false);
});

for (const healthy of [false, true]) test(`Hood attachment waits for RPC health (healthy: ${healthy})`, async t => {
  const healthPending = deferred(); const f = await mount(t, { origin: 'https://hoodchan.xyz', initialChain: 'evm', healthPending });
  await f.pickFile(); await f.upload(); assert.equal(f.writes.length, 0);
  healthPending.resolve({ ok: healthy, reason: 'not responding' }); await pause(20);
  assert.equal(f.writes.length, healthy ? 1 : 0); assert.equal(f.sent.length, healthy ? 2 : 1);
  if (!healthy) assert.match(f.w.$('#ci2_rpcwarn').text(), /not responding/);
});

test('completion and retry retain operation network, transaction ID and link', async t => {
  const writePending = deferred(), notifyPending = deferred(); const f = await mount(t, { writePending, notifyPending });
  await f.pickFile(); await f.upload(); assert.equal(f.writes.length, 1);
  f.w.history.replaceState({}, '', '?menu=hoodin'); f.w.iqCodein = f.adapters.evm;
  writePending.resolve(); await pause(20);
  assert.equal(f.sent[1].data.network, 'solana'); assert.equal(f.w.$('#ci2_share_link').val(), f.adapters.solana.viewUrl(signatures.solana));
  assert.deepEqual(f.notifications, [{ chain: 'solana', sig: signatures.solana }]);
  f.w.$('#ci2_return').trigger('click'); assert.deepEqual(f.sent[2], f.sent[1]); assert.equal(f.writes.length, 1);
});

test('only matching origin, opener and request acknowledge attachment', async t => {
  const f = await mount(t); await f.pickFile(); await f.upload();
  for (const override of [{ origin: 'https://wrong.invalid' }, { source: {} }, { requestId: 'wrong' }]) {
    f.w.dispatchEvent(new f.w.MessageEvent('message', { origin: override.origin || 'https://blockchan.sol.site', source: override.source || f.w.opener,
      data: { type: 'iq:attachment-accepted', requestId: override.requestId || requestId } }));
    assert.match(f.w.$('#ci2_return_status').text(), /Returning/);
  }
  f.w.dispatchEvent(new f.w.MessageEvent('message', { origin: 'https://blockchan.sol.site', source: f.w.opener, data: { type: 'iq:attachment-accepted', requestId } }));
  assert.match(f.w.$('#ci2_return_status').text(), /Attachment added/); assert.equal(f.w.$('#ci2_return').hasClass('hide'), true);
});

for (const origin of ['https://blockchan.sol.site.evil.invalid', 'https://blockchan.sol.site/path', 'https://user@blockchan.sol.site', 'null', 'http://localhost:3207'])
  test('production uploader rejects return origin ' + origin, async t => {
    const f = await mount(t, { origin }); assert.equal(f.sent.length, 0); assert.equal(f.w.$('#ci2_return').length, 0);
  });
for (const opts of [{ requestId: 'not-a-uuid' }, { noOpener: true }])
  test('invalid request or absent opener leaves standalone uploader', async t => {
    const f = await mount(t, opts); assert.equal(f.sent.length, 0); assert.equal(f.w.$('#ci2_return').length, 0);
  });
for (const chain of ['solana', 'evm']) test(`loopback ${chain} attachment pins initial route`, async t => {
  const f = await mount(t, { base: 'http://localhost:8080/', origin: 'http://127.0.0.1:3207', initialChain: chain });
  f.w.$.code_in_v2.init(null, chain === 'evm' ? 'solana' : 'evm'); assert.equal(f.w.iqCodein, f.adapters[chain]);
  await f.pickFile(); await f.upload(); assert.deepEqual(f.writes.map(write => write.chain), [chain]); assert.equal(f.sent.length, 2);
});

for (const [type, result] of [['text/html'], ['image/svg+xml'], ['application/octet-stream'], ['image/png', 'data:image/png;base64,%%%bad']])
  test(`attachment rejects unsupported or malformed ${type} data`, async t => {
    const f = await mount(t); await f.pickFile(type, 'fixture', result); await f.upload();
    assert.equal(f.writes.length, 0); assert.equal(f.sent.length, 1); assert.equal(f.alerts.length, 1);
  });

test('failed inscription sends no completion or recovery transaction ID', async t => {
  const f = await mount(t, { fail: true }); await f.pickFile(); await f.upload();
  assert.equal(f.writes.length, 1); assert.equal(f.sent.length, 1); assert.equal(f.w.$('#ci2_tx_id').val(), '');
});

test('closed opener retains transaction ID and link with selectable clipboard fallback', async t => {
  const f = await mount(t); f.w.opener.closed = true; await f.pickFile(); await f.upload();
  assert.equal(f.sent.length, 1); assert.equal(f.w.$('#ci2_tx_id').val(), signatures.solana);
  for (const [button, input] of [['ci2_copy_tx', 'ci2_tx_id'], ['ci2_copy_link', 'ci2_share_link']]) {
    f.w.$('#' + button).trigger('click'); await tick(); assert.equal(f.w.document.activeElement.id, input);
    assert.match(f.w.$('#ci2_link_status').text(), /Select and copy/);
  }
});

test('copy controls reuse saved values and retrying return never re-inscribes', async t => {
  const f = await mount(t); const copied = [];
  Object.defineProperty(f.w.navigator, 'clipboard', { value: { writeText: async value => copied.push(value) } });
  await f.pickFile(); await f.upload(); f.w.$('#ci2_copy_tx').trigger('click'); f.w.$('#ci2_copy_link').trigger('click'); await tick();
  assert.deepEqual(copied, [signatures.solana, f.adapters.solana.viewUrl(signatures.solana)]);
  f.w.$('#ci2_return').trigger('click'); assert.equal(f.writes.length, 1); assert.deepEqual(f.sent[2], f.sent[1]);
});

test('unreachable opener keeps completed recovery fields without another write', async t => {
  const f = await mount(t);
  f.w.opener.postMessage = () => { throw new Error('fixture popup navigation'); };
  await f.pickFile(); await f.upload();
  assert.equal(f.w.$('#ci2_tx_id').val(), signatures.solana);
  assert.match(f.w.$('#ci2_return_status').text(), /Could not reach/);
  f.w.$('#ci2_return').trigger('click'); assert.equal(f.writes.length, 1);
});

test('rejected clipboard access selects the saved transaction ID', async t => {
  const f = await mount(t);
  Object.defineProperty(f.w.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('fixture clipboard denied'); } } });
  await f.pickFile(); await f.upload(); f.w.$('#ci2_copy_tx').trigger('click'); await tick();
  assert.equal(f.w.document.activeElement.id, 'ci2_tx_id');
  assert.equal(f.w.document.activeElement.value, signatures.solana);
  assert.match(f.w.$('#ci2_link_status').text(), /Select and copy/);
});

test('a Hood attachment confirmed after wallet invalidation keeps its author and both Retry results', async t => {
  const writePending = deferred();
  const f = await mount(t, { origin: 'https://hoodchan.xyz', initialChain: 'evm', writePending });
  await f.pickFile(); await f.upload(); assert.equal(f.writes.length, 1);
  const author = f.writes[0].args.who;
  f.listeners.get('accountsChanged')();
  f.w.history.replaceState({}, '', '?menu=codein');
  f.adapters.evm.notify = (_, row) => { f.notificationRows.push(row); throw new Error('synchronous notification failure'); };
  writePending.resolve(); await pause(20);
  assert.equal(f.w.$('#ci2_done').hasClass('hide'), false);
  assert.equal(f.w.$('#ci2_retry').hasClass('hide'), true);
  assert.equal(f.sent[1].data.network, 'robinhood');
  assert.equal(f.sent[1].data.signature, signatures.evm);
  assert.equal(f.w.$('#ci2_tx_id').val(), signatures.evm);
  assert.equal(f.notificationRows[0].who, author);
  f.w.$('#ci2_return').trigger('click');
  assert.deepEqual(f.sent[2], f.sent[1]);
  f.w.$('#ci2_retry').trigger('click'); await pause(20);
  assert.deepEqual(f.sent[3], f.sent[1]); assert.equal(f.writes.length, 1);
  assert.equal(f.notificationRows[1].who, author);
  assert.deepEqual(f.connects, ['evm']);
});

test('network refusal before funding discards the old payload when the composition is edited', async t => {
  const burnerPending = deferred(); const f = await mount(t, { burnerPending });
  await f.pickFile('image/png', 'original.png'); await f.upload();
  f.w.history.replaceState({}, '', '?menu=hoodin'); burnerPending.resolve(); await pause(20);
  assert.equal(f.w.$('#ci2_compose').hasClass('hide'), false); assert.equal(f.writes.length, 0);
  f.w.history.replaceState({}, '', '?menu=codein');
  await f.pickFile('image/png', 'replacement.png'); await f.upload();
  assert.equal(f.writes.length, 1);
  assert.match(f.writes[0].args.body, /;name=replacement\.png;base64,/);
  assert.equal(f.sent[1].data.signature, signatures.solana);
});
