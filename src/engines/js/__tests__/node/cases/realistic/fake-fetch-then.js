// Simulates fetching users and posts with Promises, chaining .then, .catch and .finally
const fakeDatabase = {
  1: { id: 1, name: "Leanne", postIds: [11, 12] },
  2: { id: 2, name: "Ervin", postIds: [21] }
};
const fakePosts = {
  11: { title: "Hello world", likes: 4 },
  12: { title: "Promises are neat", likes: 9 },
  21: { title: "My first post", likes: 1 }
};

function fetchUser(id) {
  const user = fakeDatabase[id];
  if (user) {
    return Promise.resolve(user);
  }
  return Promise.reject(new Error(`User ${id} not found`));
}

function fetchPost(id) {
  return new Promise(resolve => {
    setTimeout(() => resolve(fakePosts[id]), 0);
  });
}

const log = [];
console.log("Start");

fetchUser(1)
  .then(user => {
    console.log("Got user:", user.name);
    log.push(user.name);
    return fetchPost(user.postIds[1]);
  })
  .then(post => {
    console.log(`Post "${post.title}" has ${post.likes} likes`);
    log.push(post.title);
  })
  .catch(err => console.log("Failed:", err.message))
  .finally(() => {
    console.log("Done with user 1");
    console.log("Log:", log);
  });

fetchUser(7)
  .then(user => console.log("Should not print", user))
  .catch(err => {
    console.log("Failed:", err.message);
    log.push("error");
  });

console.log("End of script");
