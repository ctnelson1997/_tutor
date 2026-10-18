// Solves the Towers of Hanoi for 3 disks recursively, tracking the pegs as arrays
const pegs = { A: [3, 2, 1], B: [], C: [] };
const moves = [];

function moveDisk(from, to) {
  const disk = pegs[from].pop();
  const top = pegs[to][pegs[to].length - 1];
  if (top !== undefined && top < disk) {
    throw new Error("Illegal move!");
  }
  pegs[to].push(disk);
  moves.push(`${disk}: ${from}->${to}`);
  console.log(`Move disk ${disk} from ${from} to ${to}`);
}

function hanoi(n, from, to, spare) {
  if (n === 0) {
    return;
  }
  hanoi(n - 1, from, spare, to);
  moveDisk(from, to);
  hanoi(n - 1, spare, to, from);
}

hanoi(3, "A", "C", "B");
console.log("Total moves:", moves.length);
console.log("Expected:", 2 ** 3 - 1);
console.log(pegs);
