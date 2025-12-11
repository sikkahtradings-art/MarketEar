// MarketEar Binance Live Crypto Feed Bridge (wss secure)
// This version updates window.assets AND updates DOM elements directly
// to ensure the UI shows live prices even if the page uses a different 'assets' variable.

console.log("MarketEar: Binance bridge initializing...");

// Ensure window.assets exists (two assets only)
if (!window.assets || !Array.isArray(window.assets)) {
  window.assets = [
    { id: "btcusd", name: "Bitcoin", symbol: "BTC/USD", price: 0, prevPrice: 0, high: 0, low: 999999 },
    { id: "ethusd", name: "Ethereum", symbol: "ETH/USD", price: 0, prevPrice: 0, high: 0, low: 999999 }
  ];
  console.log("MarketEar: window.assets created.");
}

// Map from asset id to Binance symbol
const idToSymbol = { btcusd: "btcusdt", ethusd: "ethusdt" };

// Streams: ticker gives last price field 'c'
const streams = "btcusdt@ticker/ethusdt@ticker";
const endpoint = "wss://stream.binance.com:9443/ws/" + streams;

let ws = null;
let reconnectTimer = null;

function safeFixed(n, digits=2){
  if (!Number.isFinite(n)) return "0.00";
  return Number(n).toFixed(digits);
}

function updateDomForAsset(asset) {
  try {
    // Price element
    const priceEl = document.getElementById(`price-${asset.id}`);
    if (priceEl) priceEl.innerText = safeFixed(asset.price, 2);

    // High / Low elements
    const highEl = document.getElementById(`high-${asset.id}`);
    if (highEl) highEl.innerText = safeFixed(asset.high, 2);
    const lowEl = document.getElementById(`low-${asset.id}`);
    if (lowEl) lowEl.innerText = safeFixed(asset.low, 2);

    // Change text (compare to prevPrice)
    const changeEl = document.getElementById(`change-text-${asset.id}`);
    if (changeEl) {
      const change = (asset.price || 0) - (asset.prevPrice || asset.price || 0);
      if (Math.abs(change) > 0.001) {
        const isUp = change >= 0;
        const sign = isUp ? '▲ +' : '▼ ';
        changeEl.className = `text-sm font-semibold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`;
        changeEl.innerText = `${sign}${Math.abs(change).toFixed(2)} (live)`;
      } else {
        changeEl.className = 'text-sm font-semibold text-gray-500';
        changeEl.innerText = `0.00`;
      }
    }

    // Card border color (visual)
    const cardEl = document.getElementById(`card-${asset.id}`);
    if (cardEl) {
      cardEl.classList.remove('border-emerald-500','border-rose-500','border-gray-600');
      const change = (asset.price || 0) - (asset.prevPrice || asset.price || 0);
      if (Math.abs(change) > 0.001) {
        if (change >= 0) cardEl.classList.add('border-emerald-500');
        else cardEl.classList.add('border-rose-500');
      } else {
        cardEl.classList.add('border-gray-600');
      }
    }
  } catch(e){
    // ignore DOM errors
    // console.warn('MarketEar: DOM update error', e);
  }
}

function start() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  console.log("MarketEar: Connecting to Binance…", endpoint);

  try {
    ws = new WebSocket(endpoint);
  } catch(err) {
    console.warn("MarketEar: WebSocket construction failed", err);
    reconnectTimer = setTimeout(start, 3000);
    return;
  }

  ws.onopen = () => {
    console.log("MarketEar: Binance WS open");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      // ticker stream typically returns fields like: s (symbol), c (close/last price)
      const symbol = (data.s || "").toLowerCase(); // 'BTCUSDT' -> 'btcusdt'
      const price = parseFloat(data.c || data.p || data.c);
      if (!symbol || !Number.isFinite(price)) return;

      // find asset id
      const assetKey = Object.keys(idToSymbol).find(k => idToSymbol[k] === symbol);
      if (!assetKey) return;

      // ensure window.assets has the asset object
      let asset = (window.assets || []).find(a => a.id === assetKey);
      if (!asset) {
        asset = { id: assetKey, name: assetKey.toUpperCase(), symbol: symbol.toUpperCase(), price: price, prevPrice: price, high: price, low: price };
        window.assets.push(asset);
      }

      // update values
      asset.prevPrice = Number.isFinite(asset.price) ? asset.price : price;
      asset.price = price;
      if (!asset.high || price > asset.high) asset.high = price;
      if (!asset.low || price < asset.low) asset.low = price;

      // Console debug line
      console.log(`MarketEar: ${asset.name} updated → ${price}`);

      // Update page UI directly (ensures visible numbers)
      updateDomForAsset(asset);

      // Also call updateUI() if present so page-level logic can respond
      try { if (typeof updateUI === "function") updateUI(); } catch(e){}

    } catch(err) {
      // ignore parse errors from other messages
      // console.warn("MarketEar: parse error", err);
    }
  };

  ws.onerror = (err) => {
    console.warn("MarketEar: WS error", err);
  };

  ws.onclose = () => {
    console.warn("MarketEar: WS closed — reconnecting in 3s");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(start, 3000);
  };
}

// Start the feed
start();
