// try/catch/finally around await catches a rejected promise from a timer-based function
function fetchUser(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (id === 0) reject(new Error("no user with id 0"));
      else resolve({ id, name: "user" + id });
    }, 5);
  });
}
async function load(id) {
  let status = "pending";
  try {
    const user = await fetchUser(id);
    status = "ok";
    console.log("loaded", user.name);
    return user;
  } catch (err) {
    status = "failed";
    console.log("error:", err.message);
    return null;
  } finally {
    console.log("finally for id", id, "status", status);
  }
}
async function main() {
  const a = await load(7);
  const b = await load(0);
  console.log("results", a, b);
}
main();
