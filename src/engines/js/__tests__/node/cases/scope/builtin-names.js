// Top-level names the runtime itself uses (#87): a program's own Map, Set, Symbol, String and Math
function Map(rows, cols) {
  this.rows = rows;
  this.cols = cols;
  this.cells = [];
  for (let r = 0; r < rows; r++) this.cells.push(new Array(cols).fill('.'));
}
Map.prototype.show = function () {
  return this.cells.map(row => row.join('')).join('|');
};
function Set(n) {
  this.cards = n;
}
class Symbol {
  constructor(char) {
    this.char = char;
  }
}
const grid = new Map(2, 3);
grid.cells[1][2] = new Symbol('#').char;
console.log(grid.show(), new Set(52).cards);
let String = 'not the String constructor';
const Math = { add(a, b) { return a + b; } };
console.log(String.length, Math.add(2, 3), [1, 2, 3, 4, 5, 6, 7, 8]);
class Point {}
console.log(Point, grid);
