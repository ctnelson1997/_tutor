# Reads integers until the sentinel -1 and reports their sum, count, max and evens
SENTINEL = -1

numbers = []
total = 0
value = int(input("Enter a number (-1 to stop): "))
while value != SENTINEL:
    numbers.append(value)
    total += value
    value = int(input("Enter a number (-1 to stop): "))

print()
if numbers:
    print("You entered", len(numbers), "numbers:", numbers)
    print("Sum:", total)
    print("Largest:", max(numbers))
    print("Average:", round(total / len(numbers), 2))
    evens = [n for n in numbers if n % 2 == 0]
    print("Even numbers:", evens)
else:
    print("No numbers entered")
