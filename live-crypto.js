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
  console.log("MarketEar: Connecting to Binance…", endpoint);

  ws = new WebSocket(endpoint);

  ws.onopen = () => {
    console.log("MarketEar: Binance WS open");
  };

  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const symbol = (data.s || "").toLowerCase();
      const price = parseFloat(data.c);
      if (!symbol || !price) return;

      const assetKey = Object.keys(idToSymbol).find(k => idToSymbol[k] === symbol);
      if (!assetKey) return;

      const asset = window.assets.find(a => a.id === assetKey);
      if (!asset) return;

      asset.prevPrice = asset.price || price;
      asset.price = price;

      if (!asset.high || price > asset.high) asset.high = price;
      if (!asset.low || price < asset.low) asset.low = price;

      console.log(`MarketEar: ${asset.name} updated → ${price}`);

      if (typeof updateUI === "function") updateUI();
    } catch (err) {}
  };

  ws.onerror = (err) => console.warn("MarketEar: WS error", err);

  ws.onclose = () => {
    console.warn("MarketEar: WS closed — reconnecting in 3s");
    reconnectTimer = setTimeout(start, 3000);
  };
}

start();
