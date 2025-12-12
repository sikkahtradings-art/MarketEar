// live-crypto.js
// MarketEar — Binance combined WebSocket bridge for BTC, ETH, XAU (XAUUSDT)
// Robust: uses WS for BTC/ETH/XAU and a REST fallback poller for XAU if WS doesn't deliver it.

// Immediately-invoked wrapper to avoid polluting globals too much
(function(){
  const log = (...args) => console.log('MarketEar:', ...args);

  // Streams to request via combined stream (lowercase)
  const streams = [
    'btcusdt@ticker',
    'ethusdt@ticker',
    'xauusdt@ticker'
  ];

  const base = 'wss://stream.binance.com:9443/stream?streams=';
  const url = base + streams.join('/');

  // Ensure window.assets exists and contains expected asset ids
  window.assets = window.assets || [
    { id: 'btcusd', name: 'Bitcoin', symbol: 'BTC/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'ethusd', name: 'Ethereum', symbol: 'ETH/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 },
    { id: 'xauusd', name: 'Gold', symbol: 'XAU/USD', price: 0, prevPrice: 0, high: 0, low: 0, lastUpdated: 0 }
  ];

  function findAssetById(id){
    return (window.assets||[]).find(a => a.id === id);
  }

  function updateAssetById(id, newPrice){
    const asset = findAssetById(id);
    if (!asset) {
      log('asset not found for id', id);
      return;
    }
    asset.prevPrice = asset.price || newPrice;
    asset.price = Number(newPrice);
    asset.lastUpdated = Date.now();
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

  // WebSocket connection
  let ws = null;
  let reconnectTimer = null;

  function connectWebsocket(){
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

          // If we got XAU from WS, record timestamp so REST fallback can stop
          if (assetId === 'xauusd') {
            window._marketEarXauLastWsAt = Date.now();
            // stop rest poller if running
            if (window._marketEarXauPoll) {
              clearInterval(window._marketEarXauPoll);
              window._marketEarXauPoll = null;
              log('MarketEar: XAU WS arrived — stopped REST poller.');
            }
          }

        } catch(err){
          log('bridge message parse error', err);
        }
      });

      ws.addEventListener('close', (ev) => {
        log('Binance WS closed — will reconnect in 3000ms', ev && ev.code, ev && ev.reason);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebsocket, 3000);
      });

      ws.addEventListener('error', (err) => {
        log('Binance WS error', err && err.message);
        try { ws.close(); } catch(e){}
      });

    } catch(e) {
      log('bridge connect error', e);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebsocket, 3000);
    }
  }

  // Start websocket
  connectWebsocket();

  // --- REST fallback for XAUUSDT ---
  // Poll only when WS hasn't provided XAU recently (10s threshold)
  const XAU_WS_TIMEOUT = 10000; // 10 seconds
  const XAU_POLL_INTERVAL = 5000; // 5 seconds

  async function pollXauOnce(){
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=XAUUSDT', {cache: 'no-store'});
      if (!res.ok) {
        log('XAU REST bad status', res.status);
        return;
      }
      const j = await res.json();
      const price = Number(j && j.price);
      if (isNaN(price)) return;
      updateAssetById('xauusd', price);
    } catch(e){
      log('XAU REST poll error', e && e.message);
    }
  }

  function ensureXauPollerRunningIfNeeded(){
    const lastWs = window._marketEarXauLastWsAt || 0;
    const since = Date.now() - lastWs;
    // If WS hasn't provided XAU in threshold time, ensure REST poller is running
    if (since > XAU_WS_TIMEOUT) {
      if (!window._marketEarXauPoll) {
        // immediate fetch then set interval
        pollXauOnce();
        window._marketEarXauPoll = setInterval(pollXauOnce, XAU_POLL_INTERVAL);
        log('MarketEar: XAU WS missing — started REST poller (every ' + (XAU_POLL_INTERVAL/1000) + 's).');
      }
    } else {
      // WS recently delivered XAU, ensure poller stopped
      if (window._marketEarXauPoll) {
        clearInterval(window._marketEarXauPoll);
        window._marketEarXauPoll = null;
        log('MarketEar: XAU WS healthy — stopped REST poller.');
      }
    }
  }

  // Periodically check whether we need the poller
  if (window._marketEarXauPollCheck) clearInterval(window._marketEarXauPollCheck);
  window._marketEarXauPollCheck = setInterval(ensureXauPollerRunningIfNeeded, 3000);

  // Also run check once at startup (in case WS doesn't immediately provide XAU)
  setTimeout(ensureXauPollerRunningIfNeeded, 1000);

  // Expose minimal controls for debugging from console
  window.MarketEarBinanceBridge = {
    status: () => ws ? ws.readyState : null,
    close: () => { try { if (ws) ws.close(); } catch(e){} },
    manuallyStartXauPoll: function(){ if (!window._marketEarXauPoll) { pollXauOnce(); window._marketEarXauPoll = setInterval(pollXauOnce, XAU_POLL_INTERVAL); log('MarketEar: manual start REST poller'); } },
    manuallyStopXauPoll: function(){ if (window._marketEarXauPoll) { clearInterval(window._marketEarXauPoll); window._marketEarXauPoll = null; log('MarketEar: manual stop REST poller'); } }
  };

  // Safety: if the page has updateUI function, keep it in sync periodically
  setInterval(function(){
    try {
      if (typeof updateUI === 'function') updateUI();
    } catch(e){}
  }, 1200);

  log('MarketEar bridge loaded (BTC/ETH WS + XAU REST-fallback ready).');

})();
