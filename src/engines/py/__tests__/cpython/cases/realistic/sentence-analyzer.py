# Reads a sentence and reports word count, longest word, letter frequencies and an acronym
sentence = input("Type a sentence: ")
words = sentence.split()
clean_words = [w.strip(".,!?;:").lower() for w in words]

print("Words:", len(words))
print("Characters (no spaces):", len(sentence.replace(" ", "")))
longest = ""
for w in clean_words:
    if len(w) > len(longest):
        longest = w
print("Longest word:", longest)

letters = {}
for ch in sentence.lower():
    if ch.isalpha():
        letters[ch] = letters.get(ch, 0) + 1
top = sorted(letters.items(), key=lambda kv: (-kv[1], kv[0]))[:3]
print("Top letters:", top)

acronym = "".join(w[0].upper() for w in clean_words if w)
print("Acronym:", acronym)
title = " ".join(w.capitalize() for w in clean_words)
print("Title case:", title)
reversed_order = " ".join(reversed(clean_words))
print("Reversed:", reversed_order)
lengths = {w: len(w) for w in clean_words}
print("Word lengths:", lengths)
