# sys.stdout, sys.stderr and sys.stdin are TextIOWrappers, as in CPython (#78).
import io
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.stdout.buffer.write(b"written as bytes\n")
print(type(sys.stdout).__name__, isinstance(sys.stdout, io.TextIOWrapper))
print(type(sys.stdin).__name__, isinstance(sys.stdin, io.TextIOWrapper))
print(sys.stdout.line_buffering, sys.stdout.write_through, sys.stdout.encoding)
read_line = sys.stdin.buffer.readline
first = read_line()
print(first, first.decode().strip())
print(int(input()) * 2)
print(sys.stdin.read().split())
