// ends uncaught: a TypeError reading a property of undefined (a missing nested object) inside a loop in a function
const users = [
  { name: "Ana", address: { city: "Madison" } },
  { name: "Ben", address: { city: "Austin" } },
  { name: "Cy" },
];

const cities = [];

function cityOf(user) {
  return user.address.city.toUpperCase();
}

function collectCities(list) {
  for (let i = 0; i < list.length; i++) {
    const city = cityOf(list[i]);
    cities.push(city);
    console.log(i, list[i].name, city);
  }
  return cities.length;
}

const count = collectCities(users);
console.log("count", count);
