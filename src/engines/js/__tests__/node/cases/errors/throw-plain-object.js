// An uncaught plain object prints as the console prints it (#94)
console.log('start');
throw { code: 404, msg: 'not found' };
