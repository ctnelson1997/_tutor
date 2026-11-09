import time
import unittest

time.perf_counter = lambda: 0.0  # the same "Ran 2 tests in 0.000s" in every run


def add(a, b):
    return a + b


class TestAdd(unittest.TestCase):
    def test_small(self):
        self.assertEqual(add(1, 2), 3)

    def test_wrong(self):
        self.assertEqual(add(2, 2), 5)


if __name__ == "__main__":
    unittest.main()
