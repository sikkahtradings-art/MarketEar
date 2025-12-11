<script src="live-crypto.js"></script>
// live-crypto.js - MarketEar Binance bridge (trade streams for BTC & ETH)
// Place this file in your site's repo and include <script src="live-crypto.js"></script> before </body>

(function(){
  if (window.__marketEarBinanceBridgeInstalled) {
    console.log("MarketEar: bridge already installed.");
    return;
  }
  window.__marketEarBinanceBridgeInstalled = true;

  // Expose page-scoped assets to window if possible (safe)
  try {
    const inj = document.createElement('script');
    inj.textContent = `
      try {
        if (typeof assets !== 'undefined' && !window.assets) {
          window.assets = assets;
          console.log("MarketEar: window.assets created from page assets.");
        }
      } catch(e) {}
    `;
    document.documentElement.appendChild(inj);
    inj.remove();
  } catch(e){ /* ignore */ }

  // Config - change streams here if desired (bookTicker, aggTrade etc.)
  const STREAMS = "btcusdt@trade/ethusdt@trade";
  const ENDPOINT = "wss://stream.binance.com:9443/stream?streams=" + STREAMS;
  const SYMBOL_TO_ASSETID = { "BTCUSDT": "btcusd", "ETHUSDT": "ethusd" };

  function parsePriceString(s) {
    if (typeof s === "number") return s;
    if (!s || typeof s !== "string") return NaN;
    const cleaned = s.replace(/[, ]+/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  function getAssetsArray() {
    if (Array.isArray(window.assets)) return window.assets;
    try { if (typeof assets !== "undefined" && Array.isArray(assets)) return assets; } catch(e){}
    return null;
  }

  function findAssetById(id) {
    const arr = getAssetsArray();
    return arr ? arr.find(a => a.id === id) : null;
  }

  function applyPriceToAsset(assetId, newPrice) {
    const asset = findAssetById(assetId);
    if (!asset) {
      //console.warn("MarketEar: asset not found for id", assetId);
      return false;
    }
    asset.prevPrice = Number.isFinite(asset.price) ? asset.price : (asset.prevPrice || newPrice);
    asset.price = newPrice;
    if (!Number.isFinite(asset.high) || newPrice > asset.high) asset.high = newPrice;
    if (!Number.isFinite(asset.low) || newPrice < asset.low) asset.low = newPrice;
    return true;
  }

  function safeUpdateUI() {
    try {
      if (typeof updateUI === "function") updateUI();
      else { try { eval("typeof updateUI === 'function' && updateUI()"); } catch(e){} }
    } catch (e) {
      console.error("MarketEar: updateUI error:", e);
    }
  }

  // Ensure BTC/ETH are in selectedAssets (so audio picks them up if enabled)
  try {
    if (window.STATE && Array.isArray(STATE.selectedAssets)) {
      ["btcusd","ethusd"].forEach(id => { if (!STATE.selectedAssets.includes(id)) STATE.selectedAssets.push(id); });
    }
  } catch(e){}

  // WebSocket + reconnect
  let ws = null;
  let reconnectAttempts = 0;
  let closing = false;

  function connect() {
    reconnectAttempts++;
    console.log("MarketEar: connecting to Binance", ENDPOINT);
    try {
      ws = new WebSocket(ENDPOINT);
      ws.onopen = () => { console.log("MarketEar: Binance WS open"); reconnectAttempts = 0; };
      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          const data = payload.data || payload;
          const sym = (data.s || "").toUpperCase();
          const priceStr = data.p || data.c || data.a || data.b;
          const price = parsePriceString(priceStr);
          if (!sym || !Number.isFinite(price)) return;
          const assetId = SYMBOL_TO_ASSETID[sym];
          if (!assetId) return;
          const ok = applyPriceToAsset(assetId, price);
          if (ok) {
            safeUpdateUI();
          }
        } catch (err) {
          console.error("MarketEar: ws parse error", err);
        }
      };
      ws.onerror = (e) => console.warn("MarketEar: ws error", e);
      ws.onclose = (e) => {
        if (closing) return;
        console.warn("MarketEar: Binance WS closed. Reconnecting...");
        scheduleReconnect();
      };
    } catch (err) {
      console.error("MarketEar: connect error", err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    const maxBackoff = 30000;
    const backoff = Math.min(maxBackoff, Math.pow(1.8, reconnectAttempts) * 1000);
    setTimeout(() => { if (!closing) connect(); }, backoff);
  }

  function stopBridge() {
    closing = true;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(1000, "User stopped bridge");
    window.__marketEarBinanceBridgeInstalled = false;
    console.log("MarketEar: bridge stopped.");
  }

  window.MarketEarBinanceBridge = {
    stop: stopBridge,
    endpoint: ENDPOINT,
    status: () => ({ installed: !!window.__marketEarBinanceBridgeInstalled, assetsPresent: Array.isArray(window.assets) ? window.assets.length : (typeof assets !== 'undefined' && Array.isArray(assets) ? assets.length : 0) })
  };

  // Start after slight delay
  setTimeout(connect, 200);
  console.log("MarketEar: bridge installing...");
})();
