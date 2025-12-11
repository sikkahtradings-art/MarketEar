// MarketEar Binance Live Crypto Feed Bridge
// Connects to Binance WebSocket (secure wss://) and updates window.assets

console.log("MarketEar: Binance bridge initializing...");

// Ensure assets array exists
if (!window.assets) {
    window.assets = [
        { id: "btcusd", name: "Bitcoin", symbol: "BTC/USD", price: 0, prevPrice: 0, high: 0, low: 999999 },
        { id: "ethusd", name: "Ethereum", symbol: "ETH/USD", price: 0, prevPrice: 0, high: 0, low: 999999 }
    ];
    console.log("MarketEar: window.assets created.");
}

// Price map for quick updates
const priceMap = {
    btcusd: "btcusdt",
    ethusd: "ethusdt"
};

// Start Binance WebSocket connection
function startBinanceFeed() {
    console.log("MarketEar: Connecting to Binance…");

    const streams = "btcusdt@ticker/ethusdt@ticker";
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/" + streams);

    ws.onopen = () => {
        console.log("MarketEar: Binance WS open");
    };

    ws.onerror = (err) => {
        console.log("MarketEar: Binance WS error", err);
    };

    ws.onclose = () => {
        console.log("MarketEar: Binance WS closed — reconnecting in 3s...");
        setTimeout(startBinanceFeed, 3000);
    };

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);

        if (!data.s || !data.c) return; // safety check

        const symbol = data.s.toLowerCase(); // btcusdt / ethusdt
        const price = parseFloat(data.c);

        // Find matching asset
        const assetId = Object.keys(priceMap).find(
            key => priceMap[key] === symbol
        );

        if (!assetId) return;

        const asset = window.assets.find(a => a.id === assetId);
        if (!asset) return;

        // Update asset prices
        asset.prevPrice = asset.price || price;
        asset.price = price;

        if (price > asset.high || asset.high === 0) asset.high = price;
        if (price < asset.low || asset.low === 0) asset.low = price;

        console.log(`MarketEar: ${asset.name} updated → ${price}`);

        // UI will update automatically because your main script reads window.assets
    };
}

startBinanceFeed();
