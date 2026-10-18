# The statistics module: mean/median/mode, stdev/pstdev/variance, quantiles, and its errors
import statistics as st

scores = [88, 92, 75, 92, 60, 99, 81]
print(st.mean(scores), st.median(scores), st.mode(scores))
print(st.median([1, 2, 3, 4]), st.median_low([1, 2, 3, 4]), st.median_high([1, 2, 3, 4]))
print(round(st.stdev(scores), 4), round(st.pstdev(scores), 4), round(st.variance(scores), 4))
print(st.fmean([1, 2, 4]), st.mean([1.5, 2.5]), st.multimode("aabbc"))
print(st.quantiles(scores, n=4))
print(st.mean([1, 2, 3, 4]), type(st.mean([1, 2, 3, 4])).__name__)
from fractions import Fraction
print(st.mean([Fraction(1, 3), Fraction(1, 6)]))
try:
    st.mean([])
except st.StatisticsError as e:
    print("StatisticsError:", e)
try:
    st.stdev([5])
except st.StatisticsError as e:
    print("StatisticsError:", e)
