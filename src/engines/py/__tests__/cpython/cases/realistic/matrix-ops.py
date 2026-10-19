# Adds, multiplies and transposes small matrices stored as 2D lists
def make_matrix(rows, cols, fill=0):
    return [[fill] * cols for _ in range(rows)]


def add(a, b):
    result = make_matrix(len(a), len(a[0]))
    for i in range(len(a)):
        for j in range(len(a[0])):
            result[i][j] = a[i][j] + b[i][j]
    return result


def multiply(a, b):
    rows, inner, cols = len(a), len(b), len(b[0])
    result = make_matrix(rows, cols)
    for i in range(rows):
        for j in range(cols):
            total = 0
            for k in range(inner):
                total += a[i][k] * b[k][j]
            result[i][j] = total
    return result


def transpose(m):
    return [[m[i][j] for i in range(len(m))] for j in range(len(m[0]))]


def show(name, m):
    print(name + ":")
    for row in m:
        print("  " + " ".join(f"{x:>3}" for x in row))


A = [[1, 2, 3], [4, 5, 6]]
B = [[6, 5, 4], [3, 2, 1]]
C = [[1, 0], [0, 1], [2, -1]]

show("A + B", add(A, B))
product = multiply(A, C)
show("A x C", product)
At = transpose(A)
show("A transposed", At)

identity = make_matrix(3, 3)
for i in range(3):
    identity[i][i] = 1
print("A x I == A:", multiply(A, identity) == A)
trace = sum(product[i][i] for i in range(len(product)))
print("Trace of A x C:", trace)

aliased = [[0] * 2] * 2
aliased[0][0] = 9
print("Aliasing pitfall:", aliased)
