// the conditional (ternary) operator: chains, nesting, side effects, a ternary as a statement, choosing functions
function grade(score) {
  return score >= 90 ? 'A'
    : score >= 80 ? 'B'
    : score >= 70 ? 'C'
    : 'F';
}
const scores = [95, 85, 72, 40];
const grades = scores.map(grade);
console.log(grades);
const evaluated = [];
const pick = flag => flag ? (evaluated.push('yes'), 'Y') : (evaluated.push('no'), 'N');
console.log(pick(true), pick(false), evaluated);
const age = 17;
const status = age >= 18 ? 'adult' : age >= 13 ? 'teen' : 'child';
const op = status === 'teen' ? Math.max : Math.min;
console.log(status, op(3, 9));
const nested = true ? false ? 1 : 2 : 3;
console.log('nested:', nested);
let count = 0;
count > 0 ? console.log('positive') : console.log('zero or less');
const label = n => `${n} item${n === 1 ? '' : 's'}`;
console.log(label(0), label(1), label(2));
const sign = n => (n > 0 ? 1 : n < 0 ? -1 : 0);
const signs = [-4, 0, 9].map(sign);
console.log(signs);
