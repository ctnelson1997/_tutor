# bools are ints: True + True, sum of bools, True as a dict key colliding with 1, -True, and bools held in variables
t = True
f = False
two = t + t
ten = t * 10
neg = -t
inv = ~int(t)
count = sum([True, False, True, True])
print(two, ten, neg, inv, count)
print(isinstance(t, int), t == 1, f == 0, t is True, type(two).__name__)
flags = [x > 2 for x in range(5)]
print(flags, sum(flags), flags.count(True))
d = {1: "one"}
d[True] = "true"
print(d, len(d))
score = 0
for passed in [True, False, True]:
    score += passed
print(score, t / 2, f ** 0, t // 1)
print(str(t), int(f), float(t), bool(0), bool(-1), bool("False"), bool(""))
both = t and f
either = t or f
num_or = 0 or 5
print(both, either, num_or, 3 and 4)
