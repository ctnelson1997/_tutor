# collections.Counter (most_common, arithmetic, missing keys) and defaultdict(list) / defaultdict(int)
from collections import Counter, defaultdict

text = "the cat and the zebra and the bird"
words = Counter(text.split())
print(words)
print(words.most_common(2), words["the"], words["dog"])
letters = Counter("mississippi")
print(sorted(letters.items()))
more = Counter("miss")
print(letters - more, letters + more == Counter("mississippimiss"))
letters.update("ss")
print(letters["s"], sum(letters.values()))

by_length = defaultdict(list)
for w in text.split():
    by_length[len(w)].append(w)
print(dict(by_length))
tally = defaultdict(int)
for ch in "abracadabra":
    tally[ch] += 1
print(tally["a"], tally["z"], len(tally))
print(type(tally).__name__, tally.default_factory.__name__)
