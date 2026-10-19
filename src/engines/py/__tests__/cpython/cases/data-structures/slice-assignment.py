# Slice assignment: grow, shrink, insert via an empty slice, extended slices, del slices, [:] keeps the same object
data = [0, 1, 2, 3, 4, 5]
alias = data
data[1:3] = ["a", "b", "c", "d"]
print(data)
data[2:6] = []
print(data)
data[1:1] = [9, 9]
print(data)
data[::2] = ["x", "y", "z"]
print(data)
try:
    data[::2] = [1, 2]
except ValueError as e:
    print("ValueError:", e)
del data[::3]
print(data)
del data[-1:]
print(data)
data[:] = range(4)
print(data, alias is data, alias)
data[len(data):] = "hi"
print(data)
data[-2:] = [[1, 2]]
print(data, len(data))
data[1:3] = ()
print(data)
matrix = [[0] * 3 for _ in range(3)]
middle = matrix[1]
matrix[1][:] = [7, 8, 9]
matrix[::2] = [[1], [2]]
print(matrix, middle is matrix[1])
