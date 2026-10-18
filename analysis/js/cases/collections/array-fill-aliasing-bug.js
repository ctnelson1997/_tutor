// The Array(3).fill([]) aliasing bug (every row is one array, same for objects) and its fixes; Array(n).map is a no-op
const bad = Array(3).fill([]);
bad[0].push('x');
console.log(bad, bad[0] === bad[2]);

const good = Array.from({ length: 3 }, () => []);
good[0].push('x');
console.log(good, good[0] === good[2]);

const badGrid = new Array(2).fill(new Array(3).fill(0));
badGrid[0][1] = 5;
console.log(badGrid);

const goodGrid = [...Array(2)].map(() => new Array(3).fill(0));
goodGrid[0][1] = 5;
console.log(goodGrid);

const sameObj = Array(2).fill({ count: 0 });
sameObj[0].count++;
console.log(sameObj, sameObj[1].count);

const rowTemplate = [0, 0];
const copiedRows = [rowTemplate, rowTemplate].map((row) => [...row]);
copiedRows[1][1] = 9;
console.log(copiedRows, rowTemplate);

const mapNoop = Array(2).map(() => []);
console.log(mapNoop, mapNoop.length);
const seats = Array.from({ length: 2 }, (_, r) => Array.from({ length: 2 }, (_, c) => `${'AB'[r]}${c + 1}`));
seats[0][0] = 'taken';
console.log(seats);
