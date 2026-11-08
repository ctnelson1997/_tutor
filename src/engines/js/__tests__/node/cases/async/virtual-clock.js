// The clock moves with the timers (#92): a 1-second timeout sees a second pass
function stopwatch(ms) {
  const start = Date.now();
  setTimeout(() => {
    const elapsed = Date.now() - start;
    console.log(elapsed >= ms ? 'ok' : 'too fast: ' + elapsed);
    console.log(new Date().getTime() - start >= ms);
  }, ms);
}
stopwatch(1000);
