# printf-style % formatting: %s %d %i %f %5.2f %-6s %r %x %o %e %c %%, tuples, dict keys, star width
name = "Lee"
n = 7
f = 2.71828
print("%s has %d apples" % (name, n))
print("%5.2f|%-8.3f|%08.1f" % (f, f, -f))
print("[%6s][%-6s]" % (name, name))
print("%r vs %s" % (name, name))
print("hex %x %X %#x, octal %o %#o" % (255, 255, 255, 8, 8))
print("%e %.1e %g" % (12345.678, 0.000321, 0.00001))
print("%c%c%c" % (72, 105, 33))
print("100%% done, %i%%" % 50)
print("%(user)s scored %(pts)d" % {"user": "Ana", "pts": 88})
print("%*d|%-*d|" % (5, 42, 5, 42))
print("%.*f" % (3, f))
print("%s" % [1, 2])
print("%s" % ((1, 2),))
print("%d" % 3.99, "%d" % -3.99, "%s" % 3.0)
print("%+d %+d % d" % (5, -5, 5))
msg = "%s-%s" % ("a", "b")
print(msg)
