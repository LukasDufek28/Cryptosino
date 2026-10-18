export const DEMO_TRADING_KEY = 'amber-local-trading-v1';
export const newDemoAccount = () => ({ balance: 100000, positions: [], orders: [] });

export function settleDemoOrder(account, order, asset) {
  const previous = account.orders.find(fill => fill.requestId === order.requestId);
  if (previous) return { ...account, order: previous };
  const {quantity, side, symbol} = order;
  if (!asset || asset.symbol !== symbol || !['buy', 'sell'].includes(side) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Invalid demo order.');
  const step = Math.round((asset.lotStep || 1) * (asset.lotUnits || 1));
  if (quantity % step !== 0) throw new Error('Invalid lot increment.');
  const price = side === 'buy' ? asset.ask : asset.bid;
  if (!Number.isSafeInteger(price) || price < 1) throw new Error('Quote unavailable.');
  const position = account.positions.find(p => p.symbol === symbol) || {symbol, quantity: 0, costCents: 0};
  const total = quantity * price, cash = Math.round(account.balance * 100);
  if (side === 'buy' && total > cash) throw new Error('Insufficient demo balance.');
  if (side === 'sell' && quantity > position.quantity) throw new Error('You do not own enough lots.');
  const removedCost = side === 'sell' ? Math.round(position.costCents * quantity / position.quantity) : 0;
  const next = {symbol, quantity: position.quantity + (side === 'buy' ? quantity : -quantity),
    costCents: position.costCents + (side === 'buy' ? total : -removedCost)};
  if (next.quantity > 10000000) throw new Error('Maximum demo holding reached.');
  const fill = {...order, price, total, time: Date.now(), realizedPnlCents: side === 'sell' ? total - removedCost : null};
  return {balance: (cash + (side === 'buy' ? -total : total))/100,
    positions: [...account.positions.filter(p => p.symbol !== symbol), ...(next.quantity ? [next] : [])],
    orders: [fill, ...account.orders], order: fill};
}
