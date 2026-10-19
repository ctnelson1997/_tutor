# Rolls two dice 60 times with a fixed seed and tallies the sums in a histogram
import random

random.seed(42)

ROLLS = 60
counts = {total: 0 for total in range(2, 13)}
doubles = 0
history = []
for _ in range(ROLLS):
    d1 = random.randint(1, 6)
    d2 = random.randint(1, 6)
    total = d1 + d2
    counts[total] += 1
    history.append(total)
    if d1 == d2:
        doubles += 1

print("Sum  Count  Histogram")
for total, n in counts.items():
    print(f"{total:>3}  {n:>5}  {'#' * n}")

most_common = max(counts, key=counts.get)
print("Most common sum:", most_common)
print("Doubles:", doubles)
print("First ten rolls:", history[:10])
average = sum(history) / ROLLS
print("Average sum:", round(average, 3))

deck = list(range(1, 11))
random.shuffle(deck)
hand = deck[:3]
print("Shuffled deck:", deck, "hand:", hand)
print("Random choice:", random.choice(["heads", "tails"]))
