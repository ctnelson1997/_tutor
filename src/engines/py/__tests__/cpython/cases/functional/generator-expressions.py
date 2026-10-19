# Generator expressions: lazy evaluation shown by prints, held in a variable while partly consumed
def noisy(n):
    print("  producing", n)
    return n * 10

gen = (noisy(n) for n in range(4))
print("generator created")
print(next(gen))
print("between")
print(next(gen))
rest = list(gen)
print(rest)
print(list(gen))
total = sum(n * n for n in range(1, 6))
print(total)
big = (n for n in range(10**9) if n % 7 == 0)
print(next(big), next(big), next(big))
print(max(len(w) for w in ["a", "abc", "ab"]))
