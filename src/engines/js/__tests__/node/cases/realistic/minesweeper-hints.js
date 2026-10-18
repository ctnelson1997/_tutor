// Builds the neighbor-count hint grid for a small minesweeper field stored as a 2D array
const field = [
  ["*", ".", ".", "."],
  [".", ".", "*", "."],
  [".", ".", ".", "."],
  [".", "*", ".", "*"]
];
const rows = field.length;
const cols = field[0].length;
const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function inBounds(r, c) {
  return r >= 0 && r < rows && c >= 0 && c < cols;
}

function countMines(r, c) {
  let count = 0;
  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && field[nr][nc] === "*") {
      count++;
    }
  }
  return count;
}

const hints = [];
let mineTotal = 0;
for (let r = 0; r < rows; r++) {
  const row = [];
  for (let c = 0; c < cols; c++) {
    if (field[r][c] === "*") {
      row.push("*");
      mineTotal++;
    } else {
      row.push(String(countMines(r, c)));
    }
  }
  hints.push(row);
}
for (const row of hints) {
  console.log(row.join(" "));
}
console.log("Mines:", mineTotal);
const safeCells = rows * cols - mineTotal;
console.log("Safe cells:", safeCells);
