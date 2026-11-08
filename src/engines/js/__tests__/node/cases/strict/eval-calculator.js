// A calculator's eval (#89): it runs, uninstrumented, as new Function does
const expression = '2 + 3 * 4';
console.log(eval(expression));
const answer = eval('(function () { return 6 * 7; })()');
const times = new Function('a', 'b', 'return a * b');
console.log(answer, times(6, 7));
