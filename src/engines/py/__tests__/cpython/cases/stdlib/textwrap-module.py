# textwrap: wrap into lines, fill, dedent a triple-quoted string, shorten, indent
import textwrap

para = ("Python is a programming language that lets you work quickly "
        "and integrate systems more effectively.")
lines = textwrap.wrap(para, width=24)
print(lines)
print(textwrap.fill(para, width=30))
code = """
    def greet():
        print("hi")
    greet()
"""
clean = textwrap.dedent(code)
print(repr(clean))
print(textwrap.shorten(para, width=40))
print(textwrap.shorten(para, width=40, placeholder="..."))
print(textwrap.indent("line one\nline two", "> "))
print(textwrap.fill("a " * 10, width=7))
