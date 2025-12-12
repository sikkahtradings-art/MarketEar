// live-crypto.js
// MarketEar — Binance WS for BTC/ETH + XAU REST with automatic proxy fallback
(function(){
  const log = (...a)=>console.log('MarketEar:', ...a);

  // WS streams
  const streams = ['btcusdt@ticker','ethusdt@ticker','xauusdt@ticker'];
  const wsUrl = 'wss://stream.binance.com:9443/stream?streams=' + streams.join('/');

  // ensure assets
  window.assets = window.assets || [
    { id:'btcusd', name:'Bitcoin', symbol:'BTC/USD', price:0, prevPrice:0, high:0, low:0, lastUpdated:0 },
    { id:'ethusd', name:'Ethereum', symbol:'ETH/USD', price:0, prevPrice:0, high:0, low:0, lastUpdated:0 },
    { id:'xauusd', name:'Gold', symbol:'XAU/USD', price:0, prevPrice:0, high:0, low:0, lastUpdated:0 }
  ];

  function findAsset(id){ return (window.assets||[]).find(x=>x.id===id); }
  function updateAsset(id, price){
    const a = findAsset(id);
    if (!a) { log('asset not found', id); return; }
    a.prevPrice = a.price || price;
    a.price = Number(price);
    a.lastUpdated = Date.now();
    if (!a.high || a.price > a.high) a.high = a.price;
    if (!a.low || a.price < a.low) a.low = a.price;
    log(a.name + ' updated →', a.price);
    if (typeof updateUI === 'function') updateUI();
  }

  function sym2id(sym){
    const s = (sym||'').toUpperCase();
    if (s==='BTCUSDT') return 'btcusd';
    if (s==='ETHUSDT') return 'ethusd';
    if (s==='XAUUSDT') return 'xauusd';
    if (s.endsWith('USDT')) return s.replace('USDT','USD').toLowerCase();
    return null;
  }

  // --- WebSocket connection (BTC/ETH/XAU)
  let ws=null, reconnect=null;
  function startWs(){
    try {
      log('Binance bridge initializing...');
      ws = new WebSocket(wsUrl);

      ws.addEventListener('open', ()=> log('Binance WS open') );

      ws.addEventListener('message', ev => {
        try {
          const raw = JSON.parse(ev.data);
          const p = raw.data || raw;
          const sym = (p.s || p.symbol || '').toUpperCase();
          const priceStr = p.c || p.price || p.p;
          if (!sym || priceStr == null) return;
          const id = sym2id(sym);
          if (!id) return;
          const price = Number(priceStr);
          if (isNaN(price)) return;
          updateAsset(id, price);
          if (id === 'xauusd') {
            // record ws arrival and stop poller if running
            window._marketEarXauLastWsAt = Date.now();
            if (window._marketEarXauPoll) { clearInterval(window._marketEarXauPoll); window._marketEarXauPoll = null; log('MarketEar: XAU WS arrived — stopped REST poller.'); }
          }
        } catch(e){ log('WS parse error', e && e.message); }
      });

      ws.addEventListener('close', ev => {
        log('Binance WS closed — reconnect in 3s', ev && ev.code);
        clearTimeout(reconnect); reconnect = setTimeout(startWs, 3000);
      });

      ws.addEventListener('error', err => {
        log('Binance WS error', err && err.message);
        try{ ws.close(); }catch(e){}
      });

    } catch(e){
      log('WS start error', e && e.message);
      clearTimeout(reconnect); reconnect = setTimeout(startWs, 3000);
    }
  }
  startWs();

  // --- XAU REST poller with proxy fallback
  const XAU_REST_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=XAUUSDT';
  const XAU_POLL_INTERVAL = 5000;
  const XAU_WS_TIMEOUT = 10000; // if no WS XAU within 10s, start REST

  // helper: try direct fetch then fallback to proxy (AllOrigins)
  async function fetchXauPrice(){
    // try direct
    try {
      const r = await fetch(XAU_REST_URL, {cache:'no-store'});
      if (r.ok){
        const j = await r.json();
        const price = Number(j && j.price);
        if (!isNaN(price)) return { price, source: 'rest' };
      } else {
        log('XAU REST status', r.status);
      }
    } catch(e){
      // direct failed
      // log('XAU direct fetch failed', e && e.message);
    }

    // fallback to proxy
    try {
      const proxy = 'https://api.allorigins.win/raw?url=';
      const target = encodeURIComponent(XAU_REST_URL);
      const r2 = await fetch(proxy + target, {cache:'no-store'});
      if (r2.ok){
        const j2 = await r2.json();
        const price2 = Number(j2 && j2.price);
        if (!isNaN(price2)) return { price: price2, source: 'proxy' };
      } else {
        log('XAU proxy status', r2.status);
      }
    } catch(e){
      log('XAU proxy fetch failed', e && e.message);
    }

    throw new Error('both direct and proxy fetch failed');
  }

  async function pollXauOnce(){
    try {
      const res = await fetchXauPrice();
      updateAsset('xauusd', res.price);
      log('MarketEar: XAU updated via', res.source);
      // if proxy used, still treat as valid until WS returns
      window._marketEarXauLastRestAt = Date.now();
    } catch(e){
      log('XAU poll error', e && e.message);
      // leave poller running — will retry
    }
  }

  function ensureXauPoller(){
    try {
      const lastWs = window._marketEarXauLastWsAt || 0;
      const age = Date.now() - lastWs;
      if (age > XAU_WS_TIMEOUT) {
        if (!window._marketEarXauPoll) {
          // immediate run then interval
          pollXauOnce();
          window._marketEarXauPoll = setInterval(pollXauOnce, XAU_POLL_INTERVAL);
          log('MarketEar: XAU WS missing — started REST poller (every ' + (XAU_POLL_INTERVAL/1000) + 's).');
        }
      } else {
        if (window._marketEarXauPoll) { clearInterval(window._marketEarXauPoll); window._marketEarXauPoll = null; log('MarketEar: XAU WS healthy — stopped REST poller.'); }
      }
    } catch(e){ log('ensureXauPoller error', e && e.message); }
  }

  if (window._marketEarXauPollCheck) clearInterval(window._marketEarXauPollCheck);
  window._marketEarXauPollCheck = setInterval(ensureXauPoller, 3000);
  setTimeout(ensureXauPoller, 1000);

  // safety periodic UI update
  setInterval(()=>{ try{ if (typeof updateUI === 'function') updateUI(); }catch(e){} }, 1200);

  // expose control
  window.MarketEarBinanceBridge = {
    status: ()=> ws ? ws.readyState : null,
    close: ()=>{ try{ if (ws) ws.close(); }catch(e){} },
    startXauRest: ()=> { if (!window._marketEarXauPoll) { pollXauOnce(); window._marketEarXauPoll = setInterval(pollXauOnce, XAU_POLL_INTERVAL); log('MarketEar: manual start REST poller'); } },
    stopXauRest: ()=> { if (window._marketEarXauPoll) { clearInterval(window._marketEarXauPoll); window._marketEarXauPoll = null; log('MarketEar: manual stop REST poller'); } }
  };

  log('MarketEar bridge loaded (WS + XAU REST/proxy fallback).');
})();
