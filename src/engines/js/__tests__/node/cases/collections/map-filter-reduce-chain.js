// map/filter/reduce chains: totals, grouping into an object, max via reduce, the index/array args, map(parseInt)
const orders = [
  { id: 1, customer: 'ann', total: 25.5, status: 'paid' },
  { id: 2, customer: 'bob', total: 12, status: 'pending' },
  { id: 3, customer: 'ann', total: 40, status: 'paid' },
  { id: 4, customer: 'cy', total: 8.25, status: 'paid' },
  { id: 5, customer: 'bob', total: 60, status: 'refunded' },
];

const paidTotal = orders
  .filter((o) => o.status === 'paid')
  .map((o) => o.total)
  .reduce((sum, t) => sum + t, 0);
console.log(paidTotal);

const byCustomer = orders.reduce((acc, o) => {
  acc[o.customer] = (acc[o.customer] || 0) + o.total;
  return acc;
}, {});
console.log(byCustomer);

const biggest = orders.reduce((best, o) => (o.total > best.total ? o : best));
console.log(biggest.id);

const labels = orders.map((o, i) => `${i + 1}. #${o.id} ${o.customer.toUpperCase()}`);
console.log(labels);

console.log(['1', '2', '10'].map(parseInt), ['1', '2', '10'].map(Number));
const counts = 'mississippi'.split('').reduce((m, ch) => ({ ...m, [ch]: (m[ch] ?? 0) + 1 }), {});
console.log(counts);
const avg = orders.map((o) => o.total).reduce((s, t, _, arr) => s + t / arr.length, 0);
console.log(avg.toFixed(2));
const statusList = [...new Set(orders.map((o) => o.status))];
console.log(statusList);
