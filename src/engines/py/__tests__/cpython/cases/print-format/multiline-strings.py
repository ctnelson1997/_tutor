# triple-quoted strings, implicit concatenation, splitlines, textwrap.dedent, and strings with embedded newlines in variables
import textwrap
poem = """Roses are red,
  Violets are blue,
Python is neat."""
print(poem)
lines = poem.splitlines()
print(lines)
print(len(lines), len(poem))
block = textwrap.dedent("""\
    first
      second
    third
""")
print(block, end="")
print(repr(block))
joined = ("one "
          "two "
          "three")
print(joined)
banner = "=" * 10 + "\n" + "TITLE".center(10) + "\n" + "=" * 10
print(banner)
para = "line A\nline B\n"
print(para)
print(para.count("\n"), para.strip())
wrapped = textwrap.fill("the quick brown fox jumps over the lazy dog", width=15)
print(wrapped)
