# f-string width/alignment/fill specs (:>8, :<8, :^8, :*^10, :08) on strings and numbers, dynamic widths
name = "Ada"
score = 93.456
n = 42
print(f"[{name:>8}]")
print(f"[{name:<8}]")
print(f"[{name:^8}]")
print(f"[{name:*^10}]")
print(f"[{n:>6}] [{n:<6}] [{n:^6}] [{n:06}]")
print(f"[{-n:06}] [{-n:=6}] [{n:+}]")
print(f"[{score:10.2f}] [{score:<10.1f}] [{score:^10.0f}]")
width = 12
print(f"[{name:>{width}}] [{score:>{width}.{2}f}]")
rows = [("apple", 3, 0.5), ("kiwi", 12, 0.25), ("watermelon", 1, 3.0)]
print(f"{'item':<12}{'qty':>5}{'price':>8}")
for item, qty, price in rows:
    print(f"{item:<12}{qty:>5}{price:>8.2f}")
print(f"[{'toolongvalue':5}]")
print(f"[{True:>6}] [{None!s:>6}]")
