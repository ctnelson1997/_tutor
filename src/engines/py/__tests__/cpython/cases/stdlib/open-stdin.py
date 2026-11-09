# open(0) reads the program's stdin, a competitive-programming idiom (#86).
data = open(0).read().split()
n = int(data[0])
numbers = list(map(int, data[1:1 + n]))
print(n, sum(numbers), max(numbers))
