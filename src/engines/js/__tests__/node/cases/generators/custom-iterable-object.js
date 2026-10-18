// A plain object made iterable with a [Symbol.iterator] method returning a hand-written iterator
const playlist = {
  songs: ["intro", "verse", "chorus"],
  [Symbol.iterator]() {
    let index = 0;
    const songs = this.songs;
    return {
      next() {
        if (index < songs.length) {
          return { value: songs[index++], done: false };
        }
        return { value: undefined, done: true };
      },
    };
  },
};

for (const song of playlist) {
  console.log("playing", song);
}

const copy = [...playlist];
console.log(copy);

playlist.songs.push("outro");
const [first, , third, fourth] = playlist;
console.log(first, third, fourth);

const it = playlist[Symbol.iterator]();
const r1 = it.next();
const r2 = it.next();
console.log(r1, r2);
