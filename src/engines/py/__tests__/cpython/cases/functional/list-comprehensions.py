# List comprehensions: conditions, if/else expressions, nested loops, flattening, a matrix
nums = range(1, 11)
squares = [n * n for n in nums]
evens = [n for n in nums if n % 2 == 0]
labels = ["even" if n % 2 == 0 else "odd" for n in range(4)]
pairs = [(a, b) for a in range(3) for b in range(3) if a < b]
matrix = [[r * 3 + c for c in range(3)] for r in range(3)]
flat = [x for row in matrix for x in row]
transposed = [[row[i] for row in matrix] for i in range(3)]
diagonal = [matrix[i][i] for i in range(len(matrix))]
words = ["Hello", "World", "py"]
caps = [w.upper() for w in words if len(w) > 2]
print(squares)
print(evens)
print(labels)
print(pairs)
print(matrix)
print(flat)
print(transposed)
print(diagonal, caps)
