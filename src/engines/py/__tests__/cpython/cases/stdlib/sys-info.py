# sys: argv, version_info[:2], the recursion limit, maxsize, float limits, sys.stdout.write, stderr output
import sys

print(sys.argv)
print(sys.version_info[:2], sys.version_info >= (3, 8))
print(sys.getrecursionlimit())
print(sys.maxsize == 2**31 - 1 or sys.maxsize == 2**63 - 1)
print(sys.float_info.max, sys.float_info.epsilon)
print(type(sys.modules).__name__, "sys" in sys.modules)
count = sys.stdout.write("written with sys.stdout.write\n")
print(count)
print("to stderr", file=sys.stderr)
print("int digits limit:", sys.get_int_max_str_digits())
big = 2 ** 100
print(big, len(str(big)))
