// Uses async/await with a fake weather API that resolves after setTimeout, with try/catch for errors
function fakeApi(city) {
  const data = { Madison: 18, Chicago: 21, Denver: 12 };
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (city in data) {
        resolve({ city, tempC: data[city] });
      } else {
        reject(new Error(`No weather for ${city}`));
      }
    }, 0);
  });
}

const reports = [];

async function getWeather(city) {
  try {
    const result = await fakeApi(city);
    const tempF = (result.tempC * 9) / 5 + 32;
    const line = `${result.city}: ${result.tempC}C / ${tempF}F`;
    reports.push(line);
    return line;
  } catch (err) {
    reports.push("error: " + err.message);
    return null;
  }
}

async function main() {
  console.log("Fetching weather...");
  const cities = ["Madison", "Atlantis", "Denver"];
  for (const city of cities) {
    const line = await getWeather(city);
    console.log(line === null ? `Could not load ${city}` : line);
  }
  const last = await getWeather("Chicago");
  console.log("Last:", last);
  console.log("Reports collected:", reports.length);
  return reports.length;
}

main().then(count => console.log(`main finished with ${count} reports`));
console.log("main() called, waiting...");
