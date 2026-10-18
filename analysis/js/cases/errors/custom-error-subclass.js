// Custom Error subclasses with extra fields, a set name, instanceof up the chain, and toString
class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

class RequiredError extends ValidationError {
  constructor(field) {
    super(field, `${field} is required`);
    this.name = "RequiredError";
  }
}

function validate(user) {
  if (!user.name) throw new RequiredError("name");
  if (user.age < 0) throw new ValidationError("age", "age must be positive");
  return true;
}

const results = [];
for (const user of [{ name: "Ann", age: 3 }, { age: 5 }, { name: "Bo", age: -1 }]) {
  try {
    results.push(validate(user));
  } catch (err) {
    console.log(err.name, err.field, err.message);
    console.log(err instanceof RequiredError, err instanceof ValidationError, err instanceof Error);
    console.log(String(err));
    results.push(err.field);
  }
}
console.log(results);
const lastError = new RequiredError("email");
console.log(lastError.message, Object.keys(lastError));
