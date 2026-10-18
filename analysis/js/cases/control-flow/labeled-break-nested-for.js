// labeled break and continue on nested for loops (search a grid, skip rows)
const grid = [
  [1, 2, 3],
  [4, -1, 6],
  [7, 8, 9],
];
let found = null;
outer: for (let r = 0; r < grid.length; r++) {
  for (let c = 0; c < grid[r].length; c++) {
    if (grid[r][c] < 0) {
      found = [r, c];
      break outer;
    }
  }
}
console.log("negative at", found);

const pairs = [];
rows: for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 4; j++) {
    if (j > i) continue rows;
    if ((i + j) % 2 === 1) continue;
    pairs.push(`${i}${j}`);
  }
}
console.log("pairs:", pairs.join(" "));
let lastRow = grid[grid.length - 1];
