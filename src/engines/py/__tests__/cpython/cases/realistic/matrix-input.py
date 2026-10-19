# Reads a matrix's size and rows from input, then prints row sums, column sums and its transpose
rows, cols = map(int, input("rows cols: ").split())
matrix = []
for r in range(rows):
    row = [int(x) for x in input(f"row {r + 1}: ").split()]
    if len(row) != cols:
        print(f"Row {r + 1} has {len(row)} values, padding to {cols}")
        row = (row + [0] * cols)[:cols]
    matrix.append(row)

print()
for row in matrix:
    print(" ".join(f"{v:>4}" for v in row), "|", sum(row))
col_sums = [sum(matrix[r][c] for r in range(rows)) for c in range(cols)]
print("-" * (5 * cols))
print(" ".join(f"{s:>4}" for s in col_sums))

transposed = [[matrix[r][c] for r in range(rows)] for c in range(cols)]
print("Transpose:", transposed)
biggest = max(max(row) for row in matrix)
where = [(r, c) for r in range(rows) for c in range(cols) if matrix[r][c] == biggest]
print("Largest value", biggest, "at", where)
