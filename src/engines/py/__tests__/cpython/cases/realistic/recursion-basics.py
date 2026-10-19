# Classic recursive functions: factorial, fibonacci, power, sum of digits, and string reversal
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)


def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


def power(base, exp):
    if exp == 0:
        return 1
    half = power(base, exp // 2)
    if exp % 2 == 0:
        return half * half
    return base * half * half


def sum_digits(n):
    if n < 10:
        return n
    return n % 10 + sum_digits(n // 10)


def reverse(s):
    if s == "":
        return ""
    return reverse(s[1:]) + s[0]


print("5! =", factorial(5))
print("fib(6) =", fib(6))
print("2^10 =", power(2, 10))
print("3^5 =", power(3, 5))
print("sum_digits(98765) =", sum_digits(98765))
print("reverse('stack') =", reverse("stack"))

fibs = [fib(i) for i in range(8)]
print("First fibs:", fibs)
big = factorial(20)
print("20! =", big, "has", len(str(big)), "digits")
