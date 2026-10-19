# A list of 10,000 ints built by a comprehension, summed, and kept in a variable
numbers = [i * 3 for i in range(10000)]
total = sum(numbers)
print(len(numbers), total)
print(numbers[:5], numbers[-1])
evens = numbers[::2]
print(len(evens), max(numbers))
