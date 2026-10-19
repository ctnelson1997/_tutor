# A program that ends with the closing quotes of a triple-quoted string, with """ and \ inside strings
print("start")
doc = """first line
second "line" \t tabbed"""
print(doc.upper())
quote = 'He said """hi""" and left'
print(quote, len(quote))
note = """done"""