/**
 * java.util.TimSort, ported step for step (#69), for every sort that can call
 * the program's code: List.sort, Collections.sort, Arrays.sort of objects and
 * Stream.sorted. ComparableTimSort, which Java uses without a comparator, is
 * the same algorithm with compareTo, so `compare` covers both.
 *
 * Each comparison is a call of the program's comparator or compareTo, which
 * the visualization shows as a frame and which may print or count, so the
 * calls must be the JDK's, one for one: JavaScript's Array.prototype.sort
 * leaves its comparisons unspecified (Node 24's happen to match Java's on
 * small inputs; Chrome 151's don't). That includes the JDK's
 * IllegalArgumentException for a comparator that isn't consistent.
 */

import { StdlibError } from './context';

const MIN_MERGE = 32;
const MIN_GALLOP = 7;

type Compare<T> = (a: T, b: T) => number;

/** Sort a[lo, hi) stably with `compare`, as TimSort.sort does. */
export function timSort<T>(a: T[], lo: number, hi: number, compare: Compare<T>): void {
  let nRemaining = hi - lo;
  if (nRemaining < 2) return;
  // Small arrays: a binary insertion sort after the first run, no merging.
  if (nRemaining < MIN_MERGE) {
    const initRunLen = countRunAndMakeAscending(a, lo, hi, compare);
    binarySort(a, lo, hi, lo + initRunLen, compare);
    return;
  }
  const ts = new TimSort(a, compare);
  const minRun = minRunLength(nRemaining);
  do {
    let runLen = countRunAndMakeAscending(a, lo, hi, compare);
    // A short run is extended to min(minRun, nRemaining) with a binary insertion sort.
    if (runLen < minRun) {
      const force = nRemaining <= minRun ? nRemaining : minRun;
      binarySort(a, lo, lo + force, lo + runLen, compare);
      runLen = force;
    }
    ts.pushRun(lo, runLen);
    ts.mergeCollapse();
    lo += runLen;
    nRemaining -= runLen;
  } while (nRemaining !== 0);
  ts.mergeForceCollapse();
}

/** System.arraycopy, overlapping ranges included. */
function arraycopy<T>(src: T[], srcPos: number, dest: T[], destPos: number, length: number): void {
  if (src === dest && srcPos < destPos) for (let i = length - 1; i >= 0; i--) dest[destPos + i] = src[srcPos + i];
  else for (let i = 0; i < length; i++) dest[destPos + i] = src[srcPos + i];
}

function binarySort<T>(a: T[], lo: number, hi: number, start: number, c: Compare<T>): void {
  if (start === lo) start++;
  for (; start < hi; start++) {
    const pivot = a[start];
    let left = lo, right = start;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (c(pivot, a[mid]) < 0) right = mid;
      else left = mid + 1;
    }
    arraycopy(a, left, a, left + 1, start - left);
    a[left] = pivot;
  }
}

/** The run starting at lo, made ascending (a strictly descending one is reversed): its length. */
function countRunAndMakeAscending<T>(a: T[], lo: number, hi: number, c: Compare<T>): number {
  let runHi = lo + 1;
  if (runHi === hi) return 1;
  if (c(a[runHi++], a[lo]) < 0) {
    while (runHi < hi && c(a[runHi], a[runHi - 1]) < 0) runHi++;
    reverseRange(a, lo, runHi);
  } else {
    while (runHi < hi && c(a[runHi], a[runHi - 1]) >= 0) runHi++;
  }
  return runHi - lo;
}

function reverseRange<T>(a: T[], lo: number, hi: number): void {
  hi--;
  while (lo < hi) {
    const t = a[lo];
    a[lo++] = a[hi];
    a[hi--] = t;
  }
}

function minRunLength(n: number): number {
  let r = 0;
  while (n >= MIN_MERGE) {
    r |= n & 1;
    n >>= 1;
  }
  return n + r;
}

/** Where key goes in the sorted a[base, base + len) (before equal elements), searching out from `hint`. */
function gallopLeft<T>(key: T, a: T[], base: number, len: number, hint: number, c: Compare<T>): number {
  let lastOfs = 0, ofs = 1;
  if (c(key, a[base + hint]) > 0) {
    const maxOfs = len - hint;
    while (ofs < maxOfs && c(key, a[base + hint + ofs]) > 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
      if (ofs <= 0) ofs = maxOfs;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    lastOfs += hint;
    ofs += hint;
  } else {
    const maxOfs = hint + 1;
    while (ofs < maxOfs && c(key, a[base + hint - ofs]) <= 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
      if (ofs <= 0) ofs = maxOfs;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    const tmp = lastOfs;
    lastOfs = hint - ofs;
    ofs = hint - tmp;
  }
  lastOfs++;
  while (lastOfs < ofs) {
    const m = lastOfs + ((ofs - lastOfs) >>> 1);
    if (c(key, a[base + m]) > 0) lastOfs = m + 1;
    else ofs = m;
  }
  return ofs;
}

/** Where key goes in the sorted a[base, base + len) (after equal elements), searching out from `hint`. */
function gallopRight<T>(key: T, a: T[], base: number, len: number, hint: number, c: Compare<T>): number {
  let ofs = 1, lastOfs = 0;
  if (c(key, a[base + hint]) < 0) {
    const maxOfs = hint + 1;
    while (ofs < maxOfs && c(key, a[base + hint - ofs]) < 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
      if (ofs <= 0) ofs = maxOfs;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    const tmp = lastOfs;
    lastOfs = hint - ofs;
    ofs = hint - tmp;
  } else {
    const maxOfs = len - hint;
    while (ofs < maxOfs && c(key, a[base + hint + ofs]) >= 0) {
      lastOfs = ofs;
      ofs = (ofs << 1) + 1;
      if (ofs <= 0) ofs = maxOfs;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    lastOfs += hint;
    ofs += hint;
  }
  lastOfs++;
  while (lastOfs < ofs) {
    const m = lastOfs + ((ofs - lastOfs) >>> 1);
    if (c(key, a[base + m]) < 0) ofs = m;
    else lastOfs = m + 1;
  }
  return ofs;
}

/** What the JDK's TimSort throws when a merge finds the comparator inconsistent. */
const contractViolated = () => new StdlibError('IllegalArgumentException: Comparison method violates its general contract!');

/** A sort's runs and merges, as a TimSort object holds them. */
class TimSort<T> {
  private readonly a: T[];
  private readonly c: Compare<T>;
  private minGallop = MIN_GALLOP;
  private readonly runBase: number[] = [];
  private readonly runLen: number[] = [];
  private stackSize = 0;

  constructor(a: T[], c: Compare<T>) {
    this.a = a;
    this.c = c;
  }

  pushRun(runBase: number, runLen: number): void {
    this.runBase[this.stackSize] = runBase;
    this.runLen[this.stackSize] = runLen;
    this.stackSize++;
  }

  /** Merge runs until the stack's invariants hold again (the JDK 8u fixed version). */
  mergeCollapse(): void {
    const runLen = this.runLen;
    while (this.stackSize > 1) {
      let n = this.stackSize - 2;
      if ((n > 0 && runLen[n - 1] <= runLen[n] + runLen[n + 1]) || (n > 1 && runLen[n - 2] <= runLen[n] + runLen[n - 1])) {
        if (runLen[n - 1] < runLen[n + 1]) n--;
      } else if (n < 0 || runLen[n] > runLen[n + 1]) {
        break;
      }
      this.mergeAt(n);
    }
  }

  mergeForceCollapse(): void {
    while (this.stackSize > 1) {
      let n = this.stackSize - 2;
      if (n > 0 && this.runLen[n - 1] < this.runLen[n + 1]) n--;
      this.mergeAt(n);
    }
  }

  private mergeAt(i: number): void {
    const a = this.a, c = this.c;
    let base1 = this.runBase[i], len1 = this.runLen[i];
    const base2 = this.runBase[i + 1];
    let len2 = this.runLen[i + 1];
    this.runLen[i] = len1 + len2;
    if (i === this.stackSize - 3) {
      this.runBase[i + 1] = this.runBase[i + 2];
      this.runLen[i + 1] = this.runLen[i + 2];
    }
    this.stackSize--;
    // Elements of run1 already in place need no merging, nor those of run2.
    const k = gallopRight(a[base2], a, base1, len1, 0, c);
    base1 += k;
    len1 -= k;
    if (len1 === 0) return;
    len2 = gallopLeft(a[base1 + len1 - 1], a, base2, len2, len2 - 1, c);
    if (len2 === 0) return;
    if (len1 <= len2) this.mergeLo(base1, len1, base2, len2);
    else this.mergeHi(base1, len1, base2, len2);
  }

  private mergeLo(base1: number, len1: number, base2: number, len2: number): void {
    const a = this.a, c = this.c;
    const tmp = a.slice(base1, base1 + len1);
    let cursor1 = 0, cursor2 = base2, dest = base1;
    a[dest++] = a[cursor2++];
    if (--len2 === 0) {
      arraycopy(tmp, cursor1, a, dest, len1);
      return;
    }
    if (len1 === 1) {
      arraycopy(a, cursor2, a, dest, len2);
      a[dest + len2] = tmp[cursor1];
      return;
    }
    let minGallop = this.minGallop;
    outer: for (;;) {
      let count1 = 0, count2 = 0;
      do {
        if (c(a[cursor2], tmp[cursor1]) < 0) {
          a[dest++] = a[cursor2++];
          count2++;
          count1 = 0;
          if (--len2 === 0) break outer;
        } else {
          a[dest++] = tmp[cursor1++];
          count1++;
          count2 = 0;
          if (--len1 === 1) break outer;
        }
      } while ((count1 | count2) < minGallop);
      do {
        count1 = gallopRight(a[cursor2], tmp, cursor1, len1, 0, c);
        if (count1 !== 0) {
          arraycopy(tmp, cursor1, a, dest, count1);
          dest += count1;
          cursor1 += count1;
          len1 -= count1;
          if (len1 <= 1) break outer;
        }
        a[dest++] = a[cursor2++];
        if (--len2 === 0) break outer;
        count2 = gallopLeft(tmp[cursor1], a, cursor2, len2, 0, c);
        if (count2 !== 0) {
          arraycopy(a, cursor2, a, dest, count2);
          dest += count2;
          cursor2 += count2;
          len2 -= count2;
          if (len2 === 0) break outer;
        }
        a[dest++] = tmp[cursor1++];
        if (--len1 === 1) break outer;
        minGallop--;
      } while ((count1 >= MIN_GALLOP) || (count2 >= MIN_GALLOP));
      if (minGallop < 0) minGallop = 0;
      minGallop += 2;
    }
    this.minGallop = minGallop < 1 ? 1 : minGallop;
    if (len1 === 1) {
      arraycopy(a, cursor2, a, dest, len2);
      a[dest + len2] = tmp[cursor1];
    } else if (len1 === 0) {
      throw contractViolated();
    } else {
      arraycopy(tmp, cursor1, a, dest, len1);
    }
  }

  private mergeHi(base1: number, len1: number, base2: number, len2: number): void {
    const a = this.a, c = this.c;
    const tmp = a.slice(base2, base2 + len2);
    let cursor1 = base1 + len1 - 1, cursor2 = len2 - 1, dest = base2 + len2 - 1;
    a[dest--] = a[cursor1--];
    if (--len1 === 0) {
      arraycopy(tmp, 0, a, dest - (len2 - 1), len2);
      return;
    }
    if (len2 === 1) {
      dest -= len1;
      cursor1 -= len1;
      arraycopy(a, cursor1 + 1, a, dest + 1, len1);
      a[dest] = tmp[cursor2];
      return;
    }
    let minGallop = this.minGallop;
    outer: for (;;) {
      let count1 = 0, count2 = 0;
      do {
        if (c(tmp[cursor2], a[cursor1]) < 0) {
          a[dest--] = a[cursor1--];
          count1++;
          count2 = 0;
          if (--len1 === 0) break outer;
        } else {
          a[dest--] = tmp[cursor2--];
          count2++;
          count1 = 0;
          if (--len2 === 1) break outer;
        }
      } while ((count1 | count2) < minGallop);
      do {
        count1 = len1 - gallopRight(tmp[cursor2], a, base1, len1, len1 - 1, c);
        if (count1 !== 0) {
          dest -= count1;
          cursor1 -= count1;
          len1 -= count1;
          arraycopy(a, cursor1 + 1, a, dest + 1, count1);
          if (len1 === 0) break outer;
        }
        a[dest--] = tmp[cursor2--];
        if (--len2 === 1) break outer;
        count2 = len2 - gallopLeft(a[cursor1], tmp, 0, len2, len2 - 1, c);
        if (count2 !== 0) {
          dest -= count2;
          cursor2 -= count2;
          len2 -= count2;
          arraycopy(tmp, cursor2 + 1, a, dest + 1, count2);
          if (len2 <= 1) break outer;
        }
        a[dest--] = a[cursor1--];
        if (--len1 === 0) break outer;
        minGallop--;
      } while ((count1 >= MIN_GALLOP) || (count2 >= MIN_GALLOP));
      if (minGallop < 0) minGallop = 0;
      minGallop += 2;
    }
    this.minGallop = minGallop < 1 ? 1 : minGallop;
    if (len2 === 1) {
      dest -= len1;
      cursor1 -= len1;
      arraycopy(a, cursor1 + 1, a, dest + 1, len1);
      a[dest] = tmp[cursor2];
    } else if (len2 === 0) {
      throw contractViolated();
    } else {
      arraycopy(tmp, 0, a, dest - (len2 - 1), len2);
    }
  }
}
