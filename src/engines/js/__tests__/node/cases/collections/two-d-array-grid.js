// 2D arrays: building a grid with nested loops, transpose, row/column sums, minesweeper neighbor counts with ?.[]
const rows = 3;
const cols = 4;
const grid = [];
for (let r = 0; r < rows; r++) {
  grid.push([]);
  for (let c = 0; c < cols; c++) {
    grid[r].push((r + 1) * (c + 1));
  }
}
console.log(grid);

const transpose = grid[0].map((_, c) => grid.map((row) => row[c]));
console.log(transpose);

const rowSums = grid.map((row) => row.reduce((a, b) => a + b, 0));
const colSums = transpose.map((col) => col.reduce((a, b) => a + b, 0));
console.log(rowSums, colSums);

const board = [
  ['.', '*', '.'],
  ['*', '.', '.'],
  ['.', '.', '*'],
];
const counts = board.map((row, r) =>
  row.map((cell, c) => {
    if (cell === '*') return '*';
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (board[r + dr]?.[c + dc] === '*') n++;
      }
    }
    return String(n);
  })
);
console.log(counts.map((row) => row.join('')).join('\n'));

const square = [[1, 2], [3, 4]];
const diag = square.map((row, i) => row[i]);
square[1][0] = 30;
console.log(diag, square, grid[2][3], grid.length, grid[0].length);
