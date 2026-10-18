// Splits a restaurant bill with tip among friends, rounding to cents and handing out leftover cents
function calculateTip(bill, percent = 18) {
  return Math.round(bill * percent) / 100;
}

function splitBill(bill, people, tipPercent = 18) {
  const tip = calculateTip(bill, tipPercent);
  const total = bill + tip;
  const totalCents = Math.round(total * 100);
  const baseShare = Math.floor(totalCents / people);
  let leftover = totalCents - baseShare * people;
  const shares = [];
  for (let i = 0; i < people; i++) {
    let share = baseShare;
    if (leftover > 0) {
      share++;
      leftover--;
    }
    shares.push(share / 100);
  }
  return { tip, total: totalCents / 100, shares };
}

const dinner = splitBill(87.45, 3);
console.log(`Tip: $${dinner.tip.toFixed(2)}`);
console.log(`Total: $${dinner.total.toFixed(2)}`);
dinner.shares.forEach((s, i) => console.log(`Person ${i + 1} pays $${s.toFixed(2)}`));

const lunch = splitBill(42, 4, 15);
console.log(lunch);
const sumCheck = lunch.shares.reduce((a, b) => a + b, 0);
console.log("Shares add up?", Math.abs(sumCheck - lunch.total) < 0.001);

const tipTable = [10, 15, 18, 20, 25].map(p => ({ percent: p, tip: calculateTip(50, p) }));
for (const row of tipTable) {
  console.log(`${String(row.percent).padStart(2)}% of $50 -> $${row.tip.toFixed(2)}`);
}
console.log("0.1 + 0.2 =", 0.1 + 0.2, "but rounded:", (0.1 + 0.2).toFixed(2));
