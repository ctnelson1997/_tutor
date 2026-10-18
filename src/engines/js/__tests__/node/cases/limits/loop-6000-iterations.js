// a loop of 6,000 iterations (more steps than the 5,000-step cap) that then prints its result
let sum = 0;
const milestones = [];
for (let i = 1; i <= 6000; i++) {
  sum += i;
  if (i % 1000 === 0) milestones.push(i);
}
console.log("sum", sum);
console.log("milestones", milestones);
const done = true;
