// Plays a scripted game of tic-tac-toe on a 3x3 board and checks for a winner after each move
const board = [
  [" ", " ", " "],
  [" ", " ", " "],
  [" ", " ", " "]
];

function printBoard() {
  for (let r = 0; r < 3; r++) {
    console.log(" " + board[r].join(" | "));
    if (r < 2) console.log("---+---+---");
  }
}

function winner() {
  const lines = [];
  for (let i = 0; i < 3; i++) {
    lines.push(board[i]);
    lines.push([board[0][i], board[1][i], board[2][i]]);
  }
  lines.push([board[0][0], board[1][1], board[2][2]]);
  lines.push([board[0][2], board[1][1], board[2][0]]);
  for (const line of lines) {
    if (line[0] !== " " && line[0] === line[1] && line[1] === line[2]) {
      return line[0];
    }
  }
  return null;
}

const moves = [[1, 1], [0, 0], [0, 2], [2, 0], [0, 0], [1, 0], [1, 2], [2, 1], [2, 2], [0, 1]];
let player = "X";
let result = null;
let turn = 0;
for (const [row, col] of moves) {
  if (board[row][col] !== " ") {
    console.log(`Square ${row},${col} is taken, ${player} tries again`);
    continue;
  }
  board[row][col] = player;
  turn++;
  result = winner();
  if (result) {
    break;
  }
  player = player === "X" ? "O" : "X";
}
printBoard();
console.log(result ? `${result} wins after ${turn} moves` : "No winner yet");
