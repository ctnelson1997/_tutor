// syntax error: an assignment whose left-hand side is a number literal (1 = x)
let x = 7;
let y = 2;
console.log("before", x, y);
1 = x;
console.log("after", x, y);
