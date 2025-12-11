// MarketEar Binance Live Crypto Feed Bridge (wss secure)
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

// Choose stream type: ticker gives last price in field 'c'
const streams = "btcusdt@ticker/ethusdt@ticker";
const endpoint = "wss://stream.binance.com:9443/ws/" + streams;

let ws = null;
let reconnectTimer = null;

function start() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  console.log("MarketEar: Connecting to Binance…", endpoint);

  ws = new WebSocket(endpoint);

  ws.onopen = () => {
    console.log("MarketEar: Binance WS open");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      // For ticker stream, event fields are like: s (symbol), c (close price)
      const symbol = (data.s || "").toLowerCase(); // e.g. 'BTCUSDT' -> 'btcusdt'
      const priceStr = data.c || data.p || data.c; // prefer c (last price)
      const price = parseFloat(priceStr);
      if (!symbol || !Number.isFinite(price)) return;

      // find asset by mapping
      const assetKey = Object.keys(idToSymbol).find(k => idToSymbol[k] === symbol);
      if (!assetKey) return;
      const asset = window.assets.find(a => a.id === assetKey);
      if (!asset) return;

      asset.prevPrice = asset.price || price;
      asset.price = price;
      if (!asset.high || price > asset.high) asset.high = price;
      if (!asset.low || price < asset.low) asset.low = price;

      // small console log for debugging
      console.log(`MarketEar: ${asset.name} updated → ${price}`);

      // call page UI updater if present
      try { if (typeof updateUI === "function") updateUI(); } catch(e){}
    } catch(err) {
      // ignore parse errors
      // console.error("MarketEar parse error", err);
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

// start immediately
start();
