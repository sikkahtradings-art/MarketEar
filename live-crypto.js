// live-crypto.js
// MarketEar — Binance combined WebSocket bridge for 7 crypto assets (BTC, ETH, BNB, SOL, XRP, ADA, DOGE)
// This version updates price AND high/low (from ticker payload 'h' and 'l').
// Paste this entire file into /MarketEar/live-crypto.js and commit (overwrite existing).

(function(){
  const log = (...a) => console.log('MarketEar:', ...a);

  // streams we want (lowercase)
  const streams = [
    'btcusdt@ticker',
    'ethusdt@ticker',
    'bnbusdt@ticker',
    'solusdt@ticker',
    'xrpusdt@ticker',
    'adausdt@ticker',
    'dogeusdt@ticker'
  ];

  const base = 'wss://stream.binance.com:9443/stream?streams=';
  const url = base + streams.join('/');

  // Ensure window.assets exists and has the expected IDs (7 assets)
  window.assets = window.assets || [
    { id: 'btcusd', name: 'Bitcoin', symbol: 'BTC/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'ethusd', name: 'Ethereum', symbol: 'ETH/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'bnbusd', name: 'Binance Coin', symbol: 'BNB/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'solusd', name: 'Solana', symbol: 'SOL/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'xrpusd', name: 'XRP', symbol: 'XRP/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'adausd', name: 'Cardano', symbol: 'ADA/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'dogeusd', name: 'Dogecoin', symbol: 'DOGE/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 }
  ];

  function findAssetById(id){
    return (window.assets||[]).find(a => a.id === id);
  }

  // Accepts optional high/low from ticker
  function updateAssetById(id, newPrice, newHigh, newLow){
    const asset = findAssetById(id);
    if (!asset) {
      log('asset not found for id', id);
      return;
    }
    asset.prevPrice = asset.price || newPrice;
    asset.price = Number(newPrice);
    asset.lastUpdated = Date.now();

    // If ticker provided high/low (strings), convert and set
    if (newHigh !== undefined && newHigh !== null && !isNaN(Number(newHigh))) {
      asset.high = Number(newHigh);
    } else if (!asset.high || asset.price > asset.high) {
      asset.high = asset.price;
    }

    if (newLow !== undefined && newLow !== null && !isNaN(Number(newLow))) {
      asset.low = Number(newLow);
    } else if (!asset.low || asset.price < asset.low) {
      asset.low = asset.price;
    }

    log(asset.name + ' updated →', asset.price, 'H:', asset.high, 'L:', asset.low);
    if (typeof updateUI === 'function') updateUI();
  }

  function symbolToAssetId(symUpper){
    const s = (symUpper || '').toUpperCase();
    if (s === 'BTCUSDT') return 'btcusd';
    if (s === 'ETHUSDT') return 'ethusd';
    if (s === 'BNBUSDT') return 'bnbusd';
    if (s === 'SOLUSDT') return 'solusd';
    if (s === 'XRPUSDT') return 'xrpusd';
    if (s === 'ADAUSDT') return 'adausd';
    if (s === 'DOGEUSDT') return 'dogeusd';
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

          // Typical ticker fields: s (symbol), c (close/last), h (high), l (low)
          const sym = (payload.s || payload.symbol || '').toUpperCase();
          const priceStr = payload.c || payload.price || payload.p || null;
          const highStr = payload.h !== undefined ? payload.h : (payload.high !== undefined ? payload.high : null);
          const lowStr  = payload.l !== undefined ? payload.l : (payload.low !== undefined ? payload.low : null);

          if (!sym || priceStr === null || priceStr === undefined) return;

          const assetId = symbolToAssetId(sym);
          if (!assetId) return;

          const price = Number(priceStr);
          if (isNaN(price)) return;

          updateAssetById(assetId, price, highStr, lowStr);

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

  // Safety: call updateUI periodically to keep the page in sync (in case of missed calls)
  setInterval(function(){
    try { if (typeof updateUI === 'function') updateUI(); } catch(e){}
  }, 1200);

  // expose minimal control
  window.MarketEarBinanceBridge = {
    status: () => ws ? ws.readyState : null,
    close: () => { try { if (ws) ws.close(); } catch(e){} }
  };

  log('MarketEar crypto bridge loaded (BTC, ETH, BNB, SOL, XRP, ADA, DOGE).');
})();
