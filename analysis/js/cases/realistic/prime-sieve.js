// Finds primes up to 50 with trial division and the Sieve of Eratosthenes, then factors numbers
function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) return false;
  }
  return true;
}

function sieve(limit) {
  const isComposite = new Array(limit + 1).fill(false);
  const primes = [];
  for (let i = 2; i <= limit; i++) {
    if (!isComposite[i]) {
      primes.push(i);
      for (let j = i * i; j <= limit; j += i) {
        isComposite[j] = true;
      }
    }
  }
  return primes;
}

function primeFactors(n) {
  const factors = [];
  let d = 2;
  while (n > 1) {
    while (n % d === 0) {
      factors.push(d);
      n /= d;
    }
    d++;
  }
  return factors;
}

const limit = 50;
const trialPrimes = [];
for (let n = 1; n <= limit; n++) {
  if (isPrime(n)) trialPrimes.push(n);
}
const sievePrimes = sieve(limit);
console.log("Trial division:", trialPrimes.join(", "));
console.log("Sieve:         ", sievePrimes.join(", "));
console.log("Count:", sievePrimes.length, "Match:", trialPrimes.join() === sievePrimes.join());

const twinPrimes = [];
for (let i = 0; i < sievePrimes.length - 1; i++) {
  if (sievePrimes[i + 1] - sievePrimes[i] === 2) {
    twinPrimes.push([sievePrimes[i], sievePrimes[i + 1]]);
  }
}
console.log("Twin primes:", JSON.stringify(twinPrimes));
console.log("Factors of 360:", primeFactors(360));
console.log("Factors of 91:", primeFactors(91));
