const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const math = import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname,'../../frontend/src/casino/tradingMath.js')).toString('base64'));
test('lot volumes preserve integer settlement across stocks, indexes and BTC', async () => {
 const {lotQuantity:q} = await math;
 const index={lotUnits:100,lotStep:.01}, stock={lotUnits:1,lotStep:1}, btc={lotUnits:10000,lotStep:.0001};
 assert.equal(q(.01,index),1); assert.equal(q(.29,index),29); assert.equal(q(1,index),100);
 assert.equal(q(1,stock),1); assert.equal(q(.5,stock),null);
 assert.equal(q(.001,btc),10); assert.equal(q(.0001,btc),1); assert.equal(q(1,btc),10000);
 for(const v of [0,-1,NaN,Infinity,'',.00001,1.0001]) assert.equal(q(v,btc),null);
 assert.equal(q(.011,index),null); assert.equal(q(10001,stock),null); assert.equal(q(1,null),null);
});
test('chart aggregates actual OHLC without inventing intrabar prices',async()=>{
 const {aggregateCandles:a}=await math;
 assert.deepEqual(a([{time:0,open:100,high:120,low:90,close:110},{time:300000,open:110,high:130,low:105,close:125},{time:900000,open:125,high:128,low:100,close:105}],15),[{time:0,open:100,high:130,low:90,close:125},{time:900000,open:125,high:128,low:100,close:105}]);
 assert.deepEqual(a([],5),[]);
 assert.deepEqual(a([{time:0,referencePrice:100}],5),[{time:0,open:100,high:100,low:100,close:100}]);
});
