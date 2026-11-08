// fetch: the run waits for the response, and its body (#92)
fetch('data:text/plain,payload')
  .then((r) => r.text())
  .then((t) => console.log('got', t));
console.log('sent');
