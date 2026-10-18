// Classic recursive functions: factorial, fibonacci, power, sum of digits and a countdown
function factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}

function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function power(base, exp) {
  if (exp === 0) return 1;
  if (exp % 2 === 0) {
    const half = power(base, exp / 2);
    return half * half;
  }
  return base * power(base, exp - 1);
}

function sumDigits(n) {
  if (n < 10) return n;
  return (n % 10) + sumDigits(Math.floor(n / 10));
}

function countdown(n) {
  if (n === 0) {
    console.log("Liftoff!");
    return;
  }
  console.log(n);
  countdown(n - 1);
}

console.log("5! =", factorial(5));
console.log("10! =", factorial(10));
const fibs = [];
for (let i = 0; i <= 8; i++) {
  fibs.push(fibonacci(i));
}
console.log("Fibonacci:", fibs);
console.log("2^10 =", power(2, 10));
console.log("3^5 =", power(3, 5));
console.log("Sum of digits of 98765:", sumDigits(98765));
countdown(3);
