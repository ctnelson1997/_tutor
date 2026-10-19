# traceback.print_exc() and warnings.warn write to stderr (with main.py's source lines); stdout stays in order
import sys
import traceback
import warnings

def ratio(a, b):
    return a / b

print("before")
try:
    ratio(1, 0)
except ZeroDivisionError:
    traceback.print_exc()
print("after the traceback")
warnings.warn("ratio() is deprecated")
print("after the warning", file=sys.stdout)
for i in range(2):
    warnings.warn("shown once per line", UserWarning)
sys.stderr.write("done\n")
print("end")
