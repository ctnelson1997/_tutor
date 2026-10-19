# print(file=sys.stderr) and sys.stderr.write interleaved with stdout; stdout must hold only stdout lines
import sys
print("step 1 to stdout")
print("warning: to stderr", file=sys.stderr)
print("step 2 to stdout")
sys.stderr.write("raw stderr write\n")
print("partial stdout ", end="")
print("ERR", file=sys.stderr)
print("finished line")
count = 0
for i in range(3):
    if i % 2 == 0:
        print("even", i)
        count += 1
    else:
        print("odd", i, file=sys.stderr)
print("count =", count, file=sys.stdout)
