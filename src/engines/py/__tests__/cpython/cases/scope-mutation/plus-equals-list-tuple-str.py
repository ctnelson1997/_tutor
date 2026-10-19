# += mutates a list in place (aliases see it, even inside a function) but rebinds tuples and strings
lst = [1, 2]
lst_alias = lst
lst += [3]
print(lst, lst_alias, lst is lst_alias)
lst = lst + [4]
print(lst, lst_alias, lst is lst_alias)
tup = (1, 2)
tup_alias = tup
tup += (3,)
print(tup, tup_alias, tup is tup_alias)
s = "ab"
s_alias = s
s += "c"
print(s, s_alias, s is s_alias)
chars = [0]
chars += "xyz"
print(chars)

def add_item(items):
    items += [99]

def add_char(text):
    text += "!"
    return text

outer = [1]
add_item(outer)
word = "hi"
shouted = add_char(word)
print(outer, word, shouted)
