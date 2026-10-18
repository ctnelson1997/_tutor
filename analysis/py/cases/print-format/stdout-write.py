# sys.stdout.write (no automatic newline, returns the count) mixed with print
import sys
written = sys.stdout.write("hello")
sys.stdout.write(" world\n")
print("write returned", written)
counts = []
for word in ["ab", "cde", ""]:
    counts.append(sys.stdout.write(word))
sys.stdout.write("\n")
print(counts)
sys.stdout.write(str(3.0) + "|" + repr("q") + "\n")
print("a", end="")
sys.stdout.write("b")
print("c")
sys.stdout.writelines(["line1\n", "line2\n"])
sys.stdout.flush()
print("done")
