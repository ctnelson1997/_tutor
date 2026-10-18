// A try/catch/finally nested inside a catch block, a throw from a catch, and shadowed catch parameters
const steps = [];

function recover(primary, backup) {
  try {
    steps.push("primary");
    return primary();
  } catch (err) {
    steps.push("caught " + err.message);
    try {
      steps.push("backup");
      return backup();
    } catch (err) {
      steps.push("backup failed " + err.message);
      throw new Error(`both failed (${err.message})`);
    } finally {
      steps.push("inner finally");
    }
  } finally {
    steps.push("outer finally");
  }
}

const ok = recover(() => { throw new Error("p1"); }, () => "backup value");
console.log(ok);
console.log(steps.join(" | "));
steps.length = 0;

let final;
try {
  recover(() => { throw new Error("p2"); }, () => { throw new Error("b2"); });
} catch (e) {
  final = e.message;
}
console.log(final);
console.log(steps.join(" | "));
