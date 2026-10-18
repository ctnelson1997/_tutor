// a fake fetch that resolves after setTimeout with a response object whose json() is async
const db = { "/users/1": { name: "Ada", langs: ["js", "py"] }, "/users/2": { name: "Linus", langs: ["c"] } };
function fakeFetch(url) {
  console.log("fetching", url);
  return new Promise((resolve) => {
    setTimeout(() => {
      const body = db[url];
      resolve({
        ok: body !== undefined,
        status: body ? 200 : 404,
        json: async () => body ?? { error: "not found" },
      });
    }, 10);
  });
}
let users = [];
async function loadUsers(ids) {
  for (const id of ids) {
    const res = await fakeFetch("/users/" + id);
    const data = await res.json();
    if (!res.ok) {
      console.log("status", res.status, data.error);
      continue;
    }
    users.push(data.name);
    console.log("loaded", data.name, "knows", data.langs.length, "languages");
  }
  return users;
}
loadUsers([1, 3, 2]).then((list) => console.log("users:", list));
