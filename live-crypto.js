// live-crypto.js
// MarketEar — Binance combined WebSocket bridge for BTC, ETH, XAU (XAUUSDT)
// Paste this entire file to /MarketEar/live-crypto.js and commit.

(function(){
  const log = (...args) => console.log('MarketEar:', ...args);

  // streams we want (lowercase)
  const streams = [
    'btcusdt@ticker',
    'ethusdt@ticker',
    'xauusdt@ticker'   // <-- correct XAU/USDT stream
  ];

  const base = 'wss://stream.binance.com:9443/stream?streams=';
  const url = base + streams.join('/');

  // Ensure window.assets exists and has the expected IDs
  window.assets = window.assets || [
    { id: 'btcusd', name: 'Bitcoin', symbol: 'BTC/USD', price: 0, prevPrice: 0, high: 0, low: 0 },
    { id: 'ethusd', name: 'Ethereum', symbol: 'ETH/USD', price: 0, prevPrice: 0, high: 0, low: 0 },
    { id: 'xauusd', name: 'Gold', symbol: 'XAU/USD', price: 0, prevPrice: 0, high: 0, low: 0 }
  ];

  function findAssetById(id){
    return window.assets.find(a => a.id === id);
  }

  function updateAssetById(id, newPrice){
    const asset = findAssetById(id);
    if (!asset) {
      log('asset not found for id', id);
      return;
    }
    asset.prevPrice = asset.price || newPrice;
    asset.price = Number(newPrice);
    if (!asset.high || asset.price > asset.high) asset.high = asset.price;
    if (!asset.low || asset.price < asset.low) asset.low = asset.price;
    log(asset.name + ' updated →', asset.price);
    if (typeof updateUI === 'function') updateUI();
  }

  function symbolToAssetId(symUpper){
    const s = (symUpper || '').toUpperCase();
    if (s === 'BTCUSDT') return 'btcusd';
    if (s === 'ETHUSDT') return 'ethusd';
    if (s === 'XAUUSDT') return 'xauusd';
    if (s.endsWith('USDT')) return s.replace('USDT','USD').toLowerCase();
    return null;
  }

  let ws = null;
  let reconnectTimer = null;

  function connect(){
    try {
      log('Binance bridge initializing...');
      ws = new WebSocket(url);

      ws.addEventListener('open', () => {
        log('Binance WS open');
      });

      ws.addEventListener('message', (ev) => {
        try {
          const raw = JSON.parse(ev.data);
          const payload = raw.data || raw;
          const sym = (payload.s || payload.symbol || '').toUpperCase();
          const priceStr = payload.c || payload.price || payload.p || null;
          if (!sym || priceStr === null || priceStr === undefined) return;
          const assetId = symbolToAssetId(sym);
          if (!assetId) return;
          const price = Number(priceStr);
          if (isNaN(price)) return;
          updateAssetById(assetId, price);
        } catch(err){
          log('bridge message parse error', err);
        }
      });

      ws.addEventListener('close', (ev) => {
        log('Binance WS closed — will reconnect in 3000ms', ev && ev.code, ev && ev.reason);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 3000);
      });

      ws.addEventListener('error', (err) => {
        log('Binance WS error', err && err.message);
        try { ws.close(); } catch(e){}
      });

    } catch(e) {
      log('bridge connect error', e);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 3000);
    }
  }

  // start connection
  connect();

  // expose minimal control
  window.MarketEarBinanceBridge = {
    status: () => ws ? ws.readyState : null,
    close: () => { try { if (ws) ws.close(); } catch(e){} }
  };
})();
