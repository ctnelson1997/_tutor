# A container class with __len__, __getitem__, __iter__ and __contains__
class Playlist:
    def __init__(self, name):
        self.name = name
        self.songs = []

    def add(self, song):
        self.songs.append(song)
        return self

    def __len__(self):
        return len(self.songs)

    def __getitem__(self, index):
        return self.songs[index]

    def __iter__(self):
        for song in self.songs:
            yield song.upper()

    def __contains__(self, song):
        return song.lower() in [s.lower() for s in self.songs]

pl = Playlist("Road trip")
pl.add("Hey Jude").add("Imagine").add("Yesterday")
print(len(pl), pl[0], pl[-1], pl[0:2])
for s in pl:
    print(s)
print("imagine" in pl, "Help" in pl)
print(list(pl), bool(pl), bool(Playlist("empty")))
try:
    pl[10]
except IndexError as e:
    print("IndexError:", e)
