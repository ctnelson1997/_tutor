// A prime sieve on a typed array (#91): each step draws its first 100 elements, not all 100,001
const N = 100000;
const isPrime = new Uint8Array(N + 1).fill(1);
isPrime[0] = isPrime[1] = 0;
for (let i = 2; i * i <= N; i++) {
  if (isPrime[i]) {
    for (let j = i * i; j <= N; j += i) isPrime[j] = 0;
  }
}
let count = 0;
for (let i = 0; i <= N; i++) count += isPrime[i];
console.log(count);
