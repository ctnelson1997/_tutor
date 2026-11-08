// An AggregateError from Promise.any, made with no stack frames, prints bracketed (#94)
Promise.any([Promise.reject('a'), Promise.reject('b')]).catch((e) => {
  console.log(e);
  console.log(e.errors.length);
});
