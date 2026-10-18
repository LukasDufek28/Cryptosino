const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const demo=import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../../frontend/src/casino/demoTrading.js')).toString('base64'));
test('local trading settles fractional BTC, retries, P/L and rejects overselling',async()=>{
 const {newDemoAccount,settleDemoOrder:s}=await demo;
 const asset={symbol:'BTCUSD',bid:649,ask:651,lotStep:.0001,lotUnits:10000};
 const order={requestId:'demo-1',symbol:'BTCUSD',side:'buy',quantity:10};
 const initial=newDemoAccount(),b=s(initial,order,asset);
 assert.equal(initial.balance,100000);assert.equal(b.balance,99934.9);assert.equal(b.positions[0].quantity,10);
 assert.equal(s(b,order,asset).balance,b.balance);
 const sold=s(b,{...order,requestId:'demo-2',side:'sell'},asset);
 assert.equal(sold.balance,99999.8);assert.equal(sold.positions.length,0);assert.equal(sold.order.realizedPnlCents,-20);
 assert.throws(()=>s(sold,{...order,requestId:'demo-3',side:'sell'},asset));
 assert.throws(()=>s({...initial,balance:0},order,asset));
 assert.throws(()=>s(initial,{...order,quantity:.1},asset));
 assert.deepEqual(newDemoAccount(),initial);
});
