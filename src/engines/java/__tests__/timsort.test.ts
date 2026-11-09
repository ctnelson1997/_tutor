/**
 * Java's TimSort (#69): every comparison a sort makes is a call of the
 * program's comparator or compareTo, shown as a frame and possibly printing,
 * so it must be the JDK's. JDK 21's sequences for 132 inputs (six patterns,
 * 0 to 5,000 elements, each comparison recorded as the pair of the elements'
 * original indices, FNV-1a hashed, with the final order's hash) are the
 * expectations here; the host's own sort is never used.
 */
import { describe, it, expect } from 'vitest';
import { timSort } from '../stdlib/timsort';
import { parseJava } from '../parser';
import { JavaInterpreter } from '../interpreter';

/** [pattern, length, comparisons, hash of the comparisons, hash of the sorted order], from JDK 21's Arrays.sort(T[], Comparator). */
const JDK: [string, number, number, number, number][] = [
  ['random', 0, 0, -2128831035, -2128831035],
  ['random', 1, 0, -2128831035, 84696351],
  ['random', 2, 1, -344711836, -344711836],
  ['random', 3, 4, 726272418, -39059118],
  ['random', 5, 9, -1706545605, -103763383],
  ['random', 8, 16, -1188268381, -635776133],
  ['random', 16, 46, 623760144, 873602819],
  ['random', 31, 117, 14128404, 1490370420],
  ['random', 32, 117, -1636915328, 827343941],
  ['random', 33, 125, -1915448685, 825252569],
  ['random', 40, 159, 1842951882, 1824390231],
  ['random', 64, 305, -1104007366, -373046373],
  ['random', 65, 314, 2000183961, -1194283019],
  ['random', 100, 542, -758543, 1527110027],
  ['random', 127, 729, -509923529, -959981670],
  ['random', 128, 732, 1222371882, -1708197433],
  ['random', 200, 1263, -1736635941, -1942626967],
  ['random', 256, 1740, 242411255, 17278057],
  ['random', 500, 3823, -2040923097, -1217185327],
  ['random', 1000, 8706, -57210883, 132017387],
  ['random', 2000, 19340, -2024143783, 1026104215],
  ['random', 5000, 55160, 2073131184, -1768577015],
  ['dups', 0, 0, -2128831035, -2128831035],
  ['dups', 1, 0, -2128831035, 84696351],
  ['dups', 2, 1, -344711836, -344711836],
  ['dups', 3, 4, 726272418, -948020038],
  ['dups', 5, 7, -1535405132, -578939969],
  ['dups', 8, 15, 1526166140, -1060475459],
  ['dups', 16, 41, -837778064, 590597445],
  ['dups', 31, 103, 29890065, -1334539944],
  ['dups', 32, 113, 756807938, 907031813],
  ['dups', 33, 121, 1184971558, -1893796257],
  ['dups', 40, 150, -61266809, -563322707],
  ['dups', 64, 274, 755028033, -306158235],
  ['dups', 65, 284, 2090661895, 712972031],
  ['dups', 100, 462, -1197402253, -806572651],
  ['dups', 127, 585, -1491013266, -1240280520],
  ['dups', 128, 615, -70550371, -1063004219],
  ['dups', 200, 999, 1569275266, -1878798211],
  ['dups', 256, 1307, -1694685582, -780976059],
  ['dups', 500, 2540, 2108548496, 1575272693],
  ['dups', 1000, 5175, 2024202990, 1947934829],
  ['dups', 2000, 10436, 1019976942, -1205644667],
  ['dups', 5000, 27653, -1099387404, -85535747],
  ['asc', 0, 0, -2128831035, -2128831035],
  ['asc', 1, 0, -2128831035, 84696351],
  ['asc', 2, 1, -344711836, 276207162],
  ['asc', 3, 2, 1215212649, 581859880],
  ['asc', 5, 4, -1154990711, -1172398097],
  ['asc', 8, 7, -1511500720, 1811325981],
  ['asc', 16, 41, -1254359526, 1066766875],
  ['asc', 31, 95, 602225626, 950129120],
  ['asc', 32, 85, -2008735502, 170140185],
  ['asc', 33, 93, -1847821737, 1312575523],
  ['asc', 40, 55, -57190910, -1887592411],
  ['asc', 64, 161, -375566661, -1936284735],
  ['asc', 65, 160, -1677788472, -1706112097],
  ['asc', 100, 216, 986425879, 928487917],
  ['asc', 127, 390, -1015161061, -894667744],
  ['asc', 128, 305, -719294737, -998884867],
  ['asc', 200, 600, -1834761588, 550672339],
  ['asc', 256, 586, 1741958368, 606252025],
  ['asc', 500, 1724, 1941635423, -1084505509],
  ['asc', 1000, 3262, -1588446043, -1331430473],
  ['asc', 2000, 6495, -1838123111, -1671253871],
  ['asc', 5000, 14350, -1969502707, 531229049],
  ['desc', 0, 0, -2128831035, -2128831035],
  ['desc', 1, 0, -2128831035, 84696351],
  ['desc', 2, 1, -344711836, -344711836],
  ['desc', 3, 2, 1215212649, -1568939036],
  ['desc', 5, 4, -1154990711, -1430334257],
  ['desc', 8, 7, -1511500720, 355414485],
  ['desc', 16, 15, 960200792, -48164539],
  ['desc', 31, 30, -1483409603, -1274170664],
  ['desc', 32, 31, -970740408, 2116950661],
  ['desc', 33, 32, -15362843, 787946079],
  ['desc', 40, 39, -1553453584, -1402168363],
  ['desc', 64, 63, 2093805608, -82279995],
  ['desc', 65, 64, -93332091, 1230487839],
  ['desc', 100, 99, 775537780, 342685881],
  ['desc', 127, 126, 1219723485, 1748258360],
  ['desc', 128, 127, -600725016, 2112388293],
  ['desc', 200, 199, -1547932656, -83627819],
  ['desc', 256, 255, 797720424, 1196734405],
  ['desc', 500, 499, 1451400900, -1474605479],
  ['desc', 1000, 999, 516911920, 2021753045],
  ['desc', 2000, 1999, 1324612632, -338097723],
  ['desc', 5000, 4999, 181930192, 250571989],
  ['saw', 0, 0, -2128831035, -2128831035],
  ['saw', 1, 0, -2128831035, 84696351],
  ['saw', 2, 1, -344711836, 276207162],
  ['saw', 3, 2, 1215212649, 581859880],
  ['saw', 5, 4, -1154990711, -1172398097],
  ['saw', 8, 7, -1511500720, 1811325981],
  ['saw', 16, 15, 960200792, -922750443],
  ['saw', 31, 30, -1483409603, 1266995256],
  ['saw', 32, 31, -970740408, 152284517],
  ['saw', 33, 32, -15362843, -1896234081],
  ['saw', 40, 60, -826484473, 344359853],
  ['saw', 64, 127, 1295580696, 1667737997],
  ['saw', 65, 128, 685216925, 299228295],
  ['saw', 100, 264, -1158642926, 7715199],
  ['saw', 127, 372, -1430962229, 447931228],
  ['saw', 128, 376, -838948787, 1633998517],
  ['saw', 200, 738, -1823611145, 1169102037],
  ['saw', 256, 986, -1458102515, -1466842777],
  ['saw', 500, 2431, 1857125371, 1203533289],
  ['saw', 1000, 5289, 1435136970, 1025574717],
  ['saw', 2000, 11095, 1564988611, 512163031],
  ['saw', 5000, 28949, -251558883, 696160181],
  ['runs', 0, 0, -2128831035, -2128831035],
  ['runs', 1, 0, -2128831035, 84696351],
  ['runs', 2, 1, -344711836, 276207162],
  ['runs', 3, 2, 1215212649, 581859880],
  ['runs', 5, 4, -1154990711, -1172398097],
  ['runs', 8, 7, -1511500720, 1811325981],
  ['runs', 16, 15, 960200792, -922750443],
  ['runs', 31, 30, -1483409603, 1266995256],
  ['runs', 32, 31, -970740408, 152284517],
  ['runs', 33, 32, -15362843, -1896234081],
  ['runs', 40, 39, -1553453584, -906745923],
  ['runs', 64, 109, -364034488, -1281449825],
  ['runs', 65, 112, -144147546, 1848052687],
  ['runs', 100, 199, 1162170126, -695615669],
  ['runs', 127, 197, -1544993005, 1639400430],
  ['runs', 128, 196, -760223018, -2073197153],
  ['runs', 200, 430, 822222016, -256456795],
  ['runs', 256, 414, -166548456, 1764095503],
  ['runs', 500, 1148, 1055057567, -450306141],
  ['runs', 1000, 2443, 88158320, -1451664715],
  ['runs', 2000, 4996, 975212548, -1639638843],
  ['runs', 5000, 12463, 1911327467, -190648859],
];

/** The input Seq.java made: a 31-bit LCG, the pattern's values, each element's original index. */
function input(pattern: string, n: number): [number, number][] {
  let x = n * 31 + pattern.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    const value = pattern === 'random' ? x % 1000 : pattern === 'dups' ? x % 4 : pattern === 'asc' ? i + (x % 10 === 0 ? -5 : 0)
      : pattern === 'desc' ? n - i : pattern === 'saw' ? i % 37 : Math.trunc(i / 50) % 2 === 1 ? n - i : i;
    out.push([value, i]);
  }
  return out;
}

const fnv = (hash: number, k: number) => Math.imul(hash ^ k, 16777619);

describe("Java's TimSort", () => {
  it.each(JDK)('compares %s of %i elements as JDK 21 does', (pattern, n, count, hash, order) => {
    const a = input(pattern, n);
    let calls = 0, h = 0x811c9dc5 | 0;
    timSort(a, 0, a.length, (p, q) => {
      calls++;
      h = fnv(fnv(h, p[1]), q[1]);
      return p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0;
    });
    const sortedHash = a.reduce((acc, e) => fnv(acc, e[1]), 0x811c9dc5 | 0);
    expect([calls, h, sortedHash]).toEqual([count, hash, order]);
  });

  it("never uses the host's Array.prototype.sort", () => {
    // The host's sort replaced by another correct one, a selection sort, which compares differently:
    // a sort through it would no longer make the JDK's calls.
    const original = Array.prototype.sort;
    Array.prototype.sort = function <T>(this: T[], compare?: (a: T, b: T) => number) {
      const c = compare ?? ((a: T, b: T) => String(a).localeCompare(String(b)));
      for (let i = 0; i < this.length; i++) {
        let min = i;
        for (let j = this.length - 1; j > i; j--) if (c(this[j], this[min]) < 0) min = j;
        [this[i], this[min]] = [this[min], this[i]];
      }
      return this;
    };
    try {
      const a = input('random', 2000);
      timSort(a, 0, a.length, (p, q) => p[0] - q[0]);
      expect(a.every((e, i) => i === 0 || a[i - 1][0] <= e[0])).toBe(true);
      const result = new JavaInterpreter().execute(parseJava(`import java.util.*;
public class Main {
  public static void main(String[] args) {
    List<Integer> list = new ArrayList<>(List.of(5, 4, 3, 2, 1));
    list.sort((a, b) -> { System.out.println("compare " + a + " " + b); return a - b; });
    Integer[] boxed = { 3, 1, 2 };
    Arrays.sort(boxed, Collections.reverseOrder());
    System.out.println(list + " " + Arrays.toString(boxed) + " " + List.of(2, 3, 1).stream().sorted().toList());
  }
}`));
      expect(result.error).toBeUndefined();
      // JDK 21's calls (the issue's table: Chrome's own sort made eight).
      expect(result.snapshots.at(-1)!.stdout).toEqual(['compare 4 5', 'compare 3 4', 'compare 2 3', 'compare 1 2', '[1, 2, 3, 4, 5] [3, 2, 1] [1, 2, 3]']);
    } finally {
      Array.prototype.sort = original;
    }
  });

  // An inconsistent comparator, ((p * 31 + q * 17) % m) - 1, over 0 … n - 1: whether JDK 21 throws, after how many calls.
  it.each([
    [100, 3, false, 99], [100, 5, false, 448], [100, 7, false, 378], [200, 3, false, 199], [200, 5, false, 995], [200, 7, true, 777],
    [500, 3, false, 499], [500, 5, false, 2497], [500, 7, true, 969], [1000, 3, false, 999], [1000, 5, true, 3750], [1000, 7, true, 969],
  ])('refuses a comparator that breaks its contract where the JDK does (%i elements, mod %i)', (n, m, throws, count) => {
    const a = Array.from({ length: n as number }, (_, i) => i);
    let calls = 0;
    const sort = () => timSort(a, 0, a.length, (p, q) => { calls++; return ((p * 31 + q * 17) % (m as number)) - 1; });
    if (throws) expect(sort).toThrow('IllegalArgumentException: Comparison method violates its general contract!');
    else sort();
    expect(calls).toBe(count);
  });
});
