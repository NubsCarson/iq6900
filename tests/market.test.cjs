const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function loadMarket(fetch) {
  const context = vm.createContext({ fetch });
  const mod = new vm.SourceTextModule(fs.readFileSync(path.resolve(__dirname, '../assets/js/codein/market.js'), 'utf8'), { context });
  await mod.link(() => { throw Error('Unexpected market dependency'); });
  await mod.evaluate();
  return mod.namespace.marketRows;
}

for (const chain of ['solana', 'robinhood']) test(`${chain}: fallback charts only coins absent from DexScreener`, async () => {
  const calls = [];
  const marketRows = await loadMarket(async url => {
    calls.push(url);
    if (url.includes('dexscreener')) return { ok: true, json: async () => [
      { baseToken: { address: 'indexed' }, pairAddress: 'dex-pool', priceUsd: '1', liquidity: { usd: 10 } }
    ] };
    return { ok: true, json: async () => ({
      data: [{ attributes: { address: 'curve', price_usd: '2', fdv_usd: '20' }, relationships: { top_pools: { data: [{ id: 'pool' }] } } }],
      included: [{ id: 'pool', attributes: { address: 'curve-pool' } }]
    }) };
  });
  const rows = await marketRows(chain, ['indexed', 'curve']);
  assert.equal(calls.length, 2);
  assert.match(calls[1], new RegExp('/networks/' + chain + '/tokens/multi/curve\\?'));
  assert.equal(rows[0].via, 'via dexscreener');
  assert.equal(rows[1].via, 'via geckoterminal');
  assert.match(rows[1].embed, new RegExp('/' + chain + '/pools/curve-pool\\?embed=1'));
  assert.equal(rows[1].siteLabel, 'OPEN ON GECKOTERMINAL');
});

test('fully indexed market avoids any fallback request', async () => {
  let calls = 0;
  const marketRows = await loadMarket(async url => {
    calls++;
    assert.match(url, /dexscreener/);
    return { ok: true, json: async () => [{ baseToken: { address: 'coin' }, pairAddress: 'pool' }] };
  });
  assert.equal((await marketRows('solana', ['coin'])).length, 1);
  assert.equal(calls, 1);
});

test('failed fallback retains the available DexScreener row', async () => {
  const marketRows = await loadMarket(async url => {
    if (url.includes('geckoterminal')) throw Error('fixture unavailable');
    return { ok: true, json: async () => [{ baseToken: { address: 'indexed' }, pairAddress: 'pool' }] };
  });
  const rows = await marketRows('robinhood', ['indexed', 'missing']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mint, 'indexed');
});
