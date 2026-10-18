# random with a fixed seed: randint, choice, shuffle, sample, random, uniform, choices; reseeding repeats
import random

random.seed(42)
rolls = [random.randint(1, 6) for _ in range(10)]
print(rolls)
colors = ["red", "green", "blue", "yellow"]
print(random.choice(colors))
deck = list(range(1, 11))
random.shuffle(deck)
print(deck)
print(random.sample(range(100), 5))
print(round(random.random(), 6), round(random.uniform(10, 20), 4))
print(random.choices("HT", k=8))
print(random.randrange(0, 100, 5))
random.seed(42)
again = [random.randint(1, 6) for _ in range(10)]
print(again == rolls)
rng = random.Random(7)
print(rng.randint(1, 1000), rng.choice(colors))
