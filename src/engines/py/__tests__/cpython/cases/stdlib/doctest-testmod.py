def square(n):
    """Return n squared.

    >>> square(3)
    9
    >>> square(-2)
    5
    """
    return n * n


if __name__ == "__main__":
    import doctest
    print(doctest.testmod())
