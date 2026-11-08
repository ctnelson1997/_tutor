// A thrown value String() can't convert keeps the steps before it (#94)
console.log('start');
throw Object.create(null);
