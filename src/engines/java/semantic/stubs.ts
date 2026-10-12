/**
 * The library's signatures (#13), written as Java declarations without
 * bodies: what javac would know about java.lang, java.util and java.io, for
 * the part of them JavaTutor emulates (stdlib/). The binder reads these to
 * type library calls and choose among their overloads; the stdlib runs them.
 *
 * `$any` is a parameter type that accepts anything as it is (no boxing): it
 * stands for a family of overloads that behave alike, such as
 * `Arrays.toString(int[])`, `Arrays.toString(Object[])`, ….
 *
 * A method missing here can still be called: the binder gives it a dynamic
 * type and the stdlib decides when the program runs.
 */

import { EXCEPTION_SUPER, exceptionPackage } from '../stdlib/exceptions';

const PRIMS = ['int', 'long', 'double', 'float', 'boolean', 'char', 'short', 'byte'];

/** Map.of with 0 to 10 key/value pairs. */
const mapOf = Array.from({ length: 11 }, (_, n) =>
  `  static <K, V> Map<K, V> of(${Array.from({ length: n }, (__, i) => `K k${i}, V v${i}`).join(', ')});`).join('\n');

const arrayCopies = [...PRIMS, 'T'].map(t => {
  const g = t === 'T' ? '<T> ' : '';
  return `  public static ${g}${t}[] copyOf(${t}[] original, int newLength);\n  public static ${g}${t}[] copyOfRange(${t}[] original, int from, int to);`;
}).join('\n');

const printOverloads = (name: string) => ['boolean', 'char', 'int', 'long', 'float', 'double', 'char[]', 'String', 'Object']
  .map(t => `  public void ${name}(${t} x);`).join('\n');

const appendOverloads = (cls: string) => ['Object', 'String', 'CharSequence', 'char[]', 'boolean', 'char', 'int', 'long', 'float', 'double']
  .map(t => `  public ${cls} append(${t} x);\n  public ${cls} insert(int offset, ${t} x);`).join('\n');

const stringBuilder = (cls: string) => `public final class ${cls} implements CharSequence, Comparable<${cls}> {
  public ${cls}() {}
  public ${cls}(int capacity) {}
  public ${cls}(String s) {}
  public ${cls}(CharSequence s) {}
${appendOverloads(cls)}
  public ${cls} append(CharSequence s, int start, int end);
  public ${cls} append(char[] s, int offset, int len);
  public String toString();
  public int length();
  public boolean isEmpty();
  public int capacity();
  public char charAt(int index);
  public void setCharAt(int index, char c);
  public ${cls} deleteCharAt(int index);
  public ${cls} delete(int start, int end);
  public ${cls} replace(int start, int end, String s);
  public int indexOf(String s);
  public int indexOf(String s, int from);
  public int lastIndexOf(String s);
  public int lastIndexOf(String s, int from);
  public ${cls} reverse();
  public void setLength(int length);
  public String substring(int start);
  public String substring(int start, int end);
  public CharSequence subSequence(int start, int end);
  public int compareTo(${cls} other);
}`;

/** An integral wrapper: Integer, Long, Short, Byte. */
const integralWrapper = (cls: string, p: string, parse: string) => `public final class ${cls} extends Number implements Comparable<${cls}> {
  public static final ${p} MAX_VALUE;
  public static final ${p} MIN_VALUE;
  public static ${p} ${parse}(String s);
  public static ${p} ${parse}(String s, int radix);
  public static ${cls} valueOf(${p} x);
  public static ${cls} valueOf(String s);
  public static ${cls} valueOf(String s, int radix);
  public static String toString(${p} x);
  public static String toString(${p} x, int radix);
  public static int compare(${p} a, ${p} b);
  public static int hashCode(${p} x);
${p === 'int' || p === 'long' ? `  public static String toBinaryString(${p} x);
  public static String toHexString(${p} x);
  public static String toOctalString(${p} x);
  public static ${p} max(${p} a, ${p} b);
  public static ${p} min(${p} a, ${p} b);
  public static ${p} sum(${p} a, ${p} b);
  public static int signum(${p} x);
  public static int bitCount(${p} x);` : ''}
  public int compareTo(${cls} other);
}`;

const floatingWrapper = (cls: string, p: string, parse: string) => `public final class ${cls} extends Number implements Comparable<${cls}> {
  public static final ${p} MAX_VALUE;
  public static final ${p} MIN_VALUE;
  public static final ${p} POSITIVE_INFINITY;
  public static final ${p} NEGATIVE_INFINITY;
  public static final ${p} NaN;
  public static ${p} ${parse}(String s);
  public static ${cls} valueOf(${p} x);
  public static ${cls} valueOf(String s);
  public static String toString(${p} x);
  public static boolean isNaN(${p} x);
  public static boolean isInfinite(${p} x);
  public static boolean isFinite(${p} x);
  public static int hashCode(${p} x);
  public static int compare(${p} a, ${p} b);
  public static ${p} max(${p} a, ${p} b);
  public static ${p} min(${p} a, ${p} b);
  public static ${p} sum(${p} a, ${p} b);
  public boolean isNaN();
  public boolean isInfinite();
  public int compareTo(${cls} other);
}`;

const math = () => {
  const four = (name: string) => ['int', 'long', 'float', 'double'].map(t => `  public static ${t} ${name}(${t} a, ${t} b);`).join('\n');
  const dd = ['sqrt', 'cbrt', 'exp', 'log', 'log10', 'floor', 'ceil', 'rint', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'toRadians', 'toDegrees']
    .map(n => `  public static double ${n}(double a);`).join('\n');
  return `public final class Math {
  public static final double PI;
  public static final double E;
  public static final double TAU;
${['int', 'long', 'float', 'double'].map(t => `  public static ${t} abs(${t} a);`).join('\n')}
${four('max')}
${four('min')}
  public static double pow(double a, double b);
  public static double hypot(double a, double b);
  public static double atan2(double y, double x);
${dd}
  public static long round(double a);
  public static int round(float a);
  public static double signum(double a);
  public static float signum(float a);
  public static double random();
  public static int floorDiv(int a, int b);
  public static long floorDiv(long a, long b);
  public static long floorDiv(long a, int b);
  public static int floorMod(int a, int b);
  public static long floorMod(long a, long b);
  public static int floorMod(long a, int b);
}`;
};

const JAVA_LANG = `
public class Object {
  public Object() {}
  public boolean equals(Object o);
  public int hashCode();
  public String toString();
  public final Class<?> getClass();
  protected Object clone();
}
public final class Class<T> {
  public String getName();
  public String getSimpleName();
  public String toString();
}
public interface Comparable<T> { int compareTo(T o); }
public interface CharSequence {
  int length();
  char charAt(int index);
  CharSequence subSequence(int start, int end);
  String toString();
  default boolean isEmpty() {}
}
public interface Iterable<T> { java.util.Iterator<T> iterator(); }
public interface AutoCloseable { void close(); }
public interface Cloneable {}
public interface Runnable { void run(); }
public final class String implements CharSequence, Comparable<String> {
  public static final java.util.Comparator<String> CASE_INSENSITIVE_ORDER;
  public String() {}
  public String(String s) {}
  public String(char[] chars) {}
  public String(char[] chars, int offset, int count) {}
  public String(StringBuilder sb) {}
  public int length();
  public boolean isEmpty();
  public boolean isBlank();
  public char charAt(int index);
  public int codePointAt(int index);
  public String substring(int begin);
  public String substring(int begin, int end);
  public CharSequence subSequence(int begin, int end);
  public int indexOf(int ch);
  public int indexOf(int ch, int from);
  public int indexOf(String s);
  public int indexOf(String s, int from);
  public int lastIndexOf(int ch);
  public int lastIndexOf(int ch, int from);
  public int lastIndexOf(String s);
  public int lastIndexOf(String s, int from);
  public boolean contains(CharSequence s);
  public boolean startsWith(String prefix);
  public boolean startsWith(String prefix, int offset);
  public boolean endsWith(String suffix);
  public boolean equalsIgnoreCase(String other);
  public boolean contentEquals(CharSequence s);
  public int compareTo(String other);
  public int compareToIgnoreCase(String other);
  public String toUpperCase();
  public String toLowerCase();
  public String trim();
  public String strip();
  public String stripLeading();
  public String stripTrailing();
  public String replace(char a, char b);
  public String replace(CharSequence target, CharSequence replacement);
  public String replaceAll(String regex, String replacement);
  public String replaceFirst(String regex, String replacement);
  public boolean matches(String regex);
  public String[] split(String regex);
  public String[] split(String regex, int limit);
  public String concat(String s);
  public String repeat(int count);
  public char[] toCharArray();
  public String intern();
  public String formatted(Object... args);
${['Object', 'char[]', ...PRIMS].map(t => `  public static String valueOf(${t} x);`).join('\n')}
  public static String valueOf(char[] chars, int offset, int count);
  public static String copyValueOf(char[] chars);
  public static String format(String format, Object... args);
  public static String join(CharSequence delimiter, CharSequence... parts);
  public static String join(CharSequence delimiter, Iterable<? extends CharSequence> parts);
}
${stringBuilder('StringBuilder')}
${stringBuilder('StringBuffer')}
public abstract class Number {
  public int intValue();
  public long longValue();
  public double doubleValue();
  public float floatValue();
  public short shortValue();
  public byte byteValue();
}
${integralWrapper('Integer', 'int', 'parseInt')}
${integralWrapper('Long', 'long', 'parseLong')}
${integralWrapper('Short', 'short', 'parseShort')}
${integralWrapper('Byte', 'byte', 'parseByte')}
${floatingWrapper('Double', 'double', 'parseDouble')}
${floatingWrapper('Float', 'float', 'parseFloat')}
public final class Boolean implements Comparable<Boolean> {
  public static final Boolean TRUE;
  public static final Boolean FALSE;
  public static boolean parseBoolean(String s);
  public static Boolean valueOf(boolean b);
  public static Boolean valueOf(String s);
  public static String toString(boolean b);
  public static int hashCode(boolean b);
  public static int compare(boolean a, boolean b);
  public static boolean logicalAnd(boolean a, boolean b);
  public static boolean logicalOr(boolean a, boolean b);
  public static boolean logicalXor(boolean a, boolean b);
  public boolean booleanValue();
  public int compareTo(Boolean other);
}
public final class Character implements Comparable<Character> {
  public static final char MIN_VALUE;
  public static final char MAX_VALUE;
${['isDigit', 'isLetter', 'isLetterOrDigit', 'isWhitespace', 'isSpaceChar', 'isUpperCase', 'isLowerCase'].map(n => `  public static boolean ${n}(char c);`).join('\n')}
  public static boolean isAlphabetic(int codePoint);
  public static char toUpperCase(char c);
  public static char toLowerCase(char c);
  public static int getNumericValue(char c);
  public static String toString(char c);
  public static Character valueOf(char c);
  public static int hashCode(char c);
  public static int compare(char a, char b);
  public char charValue();
  public int compareTo(Character other);
}
${math()}
public final class System {
  public static final java.io.PrintStream out;
  public static final java.io.PrintStream err;
  public static final java.io.InputStream in;
  public static long currentTimeMillis();
  public static long nanoTime();
  public static String lineSeparator();
  public static void exit(int status);
  public static void arraycopy(Object src, int srcPos, Object dest, int destPos, int length);
}
`;

const JAVA_IO = `
public interface Serializable {}
public interface Closeable extends AutoCloseable {}
public abstract class InputStream implements Closeable {}
public class PrintStream implements Closeable {
  public void println();
${printOverloads('println')}
${printOverloads('print')}
  public PrintStream printf(String format, Object... args);
  public PrintStream format(String format, Object... args);
  public void flush();
}
`;

const JAVA_UTIL = `
public interface Iterator<E> {
  boolean hasNext();
  E next();
  default void remove() {}
}
public interface Comparator<T> {
  int compare(T a, T b);
  default Comparator<T> reversed() {}
  static <T extends Comparable<? super T>> Comparator<T> naturalOrder();
  static <T extends Comparable<? super T>> Comparator<T> reverseOrder();
}
public interface Collection<E> extends Iterable<E> {
  int size();
  boolean isEmpty();
  boolean contains(Object o);
  boolean add(E e);
  boolean remove(Object o);
  boolean addAll(Collection<? extends E> c);
  boolean removeAll(Collection<?> c);
  boolean retainAll(Collection<?> c);
  boolean containsAll(Collection<?> c);
  void clear();
  Object[] toArray();
  <T> T[] toArray(T[] a);
  Iterator<E> iterator();
}
public interface List<E> extends Collection<E> {
  E get(int index);
  E set(int index, E e);
  void add(int index, E e);
  E remove(int index);
  int indexOf(Object o);
  int lastIndexOf(Object o);
  List<E> subList(int from, int to);
  void sort(Comparator<? super E> c);
  boolean addAll(int index, Collection<? extends E> c);
  E getFirst();
  E getLast();
  E removeFirst();
  E removeLast();
  void addFirst(E e);
  void addLast(E e);
  static <E> List<E> of(E... elements);
  static <E> List<E> copyOf(Collection<? extends E> c);
}
public class ArrayList<E> implements List<E> {
  public ArrayList() {}
  public ArrayList(int capacity) {}
  public ArrayList(Collection<? extends E> c) {}
  public void ensureCapacity(int capacity);
  public void trimToSize();
}
public class Vector<E> implements List<E> {
  public Vector() {}
  public Vector(int capacity) {}
  public Vector(Collection<? extends E> c) {}
  public E elementAt(int index);
  public E firstElement();
  public E lastElement();
  public void addElement(E e);
  public void insertElementAt(E e, int index);
  public void removeElementAt(int index);
  public void setElementAt(E e, int index);
  public void removeAllElements();
  public boolean removeElement(Object o);
}
public class Stack<E> extends Vector<E> {
  public Stack() {}
  public E push(E e);
  public E pop();
  public E peek();
  public boolean empty();
  public int search(Object o);
}
public interface Queue<E> extends Collection<E> {
  boolean offer(E e);
  E poll();
  E peek();
  E element();
  E remove();
}
public interface Deque<E> extends Queue<E> {
  void addFirst(E e);
  void addLast(E e);
  boolean offerFirst(E e);
  boolean offerLast(E e);
  E removeFirst();
  E removeLast();
  E pollFirst();
  E pollLast();
  E getFirst();
  E getLast();
  E peekFirst();
  E peekLast();
  void push(E e);
  E pop();
  boolean removeFirstOccurrence(Object o);
  boolean removeLastOccurrence(Object o);
  Iterator<E> descendingIterator();
}
public class LinkedList<E> implements List<E>, Deque<E> {
  public LinkedList() {}
  public LinkedList(Collection<? extends E> c) {}
}
public class ArrayDeque<E> implements Deque<E> {
  public ArrayDeque() {}
  public ArrayDeque(int capacity) {}
  public ArrayDeque(Collection<? extends E> c) {}
}
public class PriorityQueue<E> implements Queue<E> {
  public PriorityQueue() {}
  public PriorityQueue(int capacity) {}
  public PriorityQueue(Comparator<? super E> c) {}
  public PriorityQueue(int capacity, Comparator<? super E> c) {}
  public PriorityQueue(Collection<? extends E> c) {}
  public Comparator<? super E> comparator();
}
public interface Set<E> extends Collection<E> {
  static <E> Set<E> of(E... elements);
  static <E> Set<E> copyOf(Collection<? extends E> c);
}
public interface SortedSet<E> extends Set<E> {
  E first();
  E last();
  SortedSet<E> headSet(E to);
  SortedSet<E> tailSet(E from);
  SortedSet<E> subSet(E from, E to);
  Comparator<? super E> comparator();
}
public interface NavigableSet<E> extends SortedSet<E> {
  E floor(E e);
  E ceiling(E e);
  E higher(E e);
  E lower(E e);
  E pollFirst();
  E pollLast();
  NavigableSet<E> headSet(E to, boolean inclusive);
  NavigableSet<E> tailSet(E from, boolean inclusive);
  NavigableSet<E> subSet(E from, boolean fromInclusive, E to, boolean toInclusive);
  NavigableSet<E> descendingSet();
  Iterator<E> descendingIterator();
}
public class HashSet<E> implements Set<E> {
  public HashSet() {}
  public HashSet(int capacity) {}
  public HashSet(int capacity, float loadFactor) {}
  public HashSet(Collection<? extends E> c) {}
}
public class LinkedHashSet<E> extends HashSet<E> {
  public LinkedHashSet() {}
  public LinkedHashSet(int capacity) {}
  public LinkedHashSet(int capacity, float loadFactor) {}
  public LinkedHashSet(Collection<? extends E> c) {}
}
public class TreeSet<E> implements NavigableSet<E> {
  public TreeSet() {}
  public TreeSet(Comparator<? super E> c) {}
  public TreeSet(Collection<? extends E> c) {}
}
public interface Map<K, V> {
  int size();
  boolean isEmpty();
  boolean containsKey(Object key);
  boolean containsValue(Object value);
  V get(Object key);
  V put(K key, V value);
  V remove(Object key);
  boolean remove(Object key, Object value);
  void putAll(Map<? extends K, ? extends V> m);
  void clear();
  Set<K> keySet();
  Collection<V> values();
  Set<Map.Entry<K, V>> entrySet();
  V getOrDefault(Object key, V defaultValue);
  V putIfAbsent(K key, V value);
  V replace(K key, V value);
  boolean replace(K key, V oldValue, V newValue);
${mapOf}
  static <K, V> Map.Entry<K, V> entry(K k, V v);
  static <K, V> Map<K, V> copyOf(Map<? extends K, ? extends V> m);
  interface Entry<K, V> {
    K getKey();
    V getValue();
    V setValue(V value);
  }
}
public interface SortedMap<K, V> extends Map<K, V> {
  K firstKey();
  K lastKey();
  SortedMap<K, V> headMap(K to);
  SortedMap<K, V> tailMap(K from);
  SortedMap<K, V> subMap(K from, K to);
  Comparator<? super K> comparator();
}
public interface NavigableMap<K, V> extends SortedMap<K, V> {
  Map.Entry<K, V> firstEntry();
  Map.Entry<K, V> lastEntry();
  Map.Entry<K, V> pollFirstEntry();
  Map.Entry<K, V> pollLastEntry();
  K floorKey(K key);
  K ceilingKey(K key);
  K higherKey(K key);
  K lowerKey(K key);
  Map.Entry<K, V> floorEntry(K key);
  Map.Entry<K, V> ceilingEntry(K key);
  Map.Entry<K, V> higherEntry(K key);
  Map.Entry<K, V> lowerEntry(K key);
  NavigableMap<K, V> headMap(K to, boolean inclusive);
  NavigableMap<K, V> tailMap(K from, boolean inclusive);
  NavigableMap<K, V> subMap(K from, boolean fromInclusive, K to, boolean toInclusive);
  NavigableMap<K, V> descendingMap();
  NavigableSet<K> descendingKeySet();
  NavigableSet<K> navigableKeySet();
}
public class HashMap<K, V> implements Map<K, V> {
  public HashMap() {}
  public HashMap(int capacity) {}
  public HashMap(int capacity, float loadFactor) {}
  public HashMap(Map<? extends K, ? extends V> m) {}
}
public class LinkedHashMap<K, V> extends HashMap<K, V> {
  public LinkedHashMap() {}
  public LinkedHashMap(int capacity) {}
  public LinkedHashMap(int capacity, float loadFactor) {}
  public LinkedHashMap(int capacity, float loadFactor, boolean accessOrder) {}
  public LinkedHashMap(Map<? extends K, ? extends V> m) {}
}
public class TreeMap<K, V> implements NavigableMap<K, V> {
  public TreeMap() {}
  public TreeMap(Comparator<? super K> c) {}
  public TreeMap(Map<? extends K, ? extends V> m) {}
}
public final class Arrays {
  public static String toString($any a);
  public static String deepToString(Object[] a);
  public static int hashCode($any a);
  public static void sort($any a);
  public static void sort($any a, int from, int to);
  public static <T> void sort(T[] a, Comparator<? super T> c);
  public static <T> void sort(T[] a, int from, int to, Comparator<? super T> c);
  public static void fill($any a, $any value);
  public static void fill($any a, int from, int to, $any value);
${arrayCopies}
  public static boolean equals($any a, $any b);
  public static boolean deepEquals(Object[] a, Object[] b);
  public static int binarySearch($any a, $any key);
  public static int binarySearch($any a, int from, int to, $any key);
  public static <T> int binarySearch(T[] a, T key, Comparator<? super T> c);
  public static <T> List<T> asList(T... a);
}
public final class Collections {
  public static <T extends Comparable<? super T>> void sort(List<T> list);
  public static <T> void sort(List<T> list, Comparator<? super T> c);
  public static <T> Comparator<T> reverseOrder();
  public static <T> Comparator<T> reverseOrder(Comparator<T> c);
  public static void reverse(List<?> list);
  public static void shuffle(List<?> list);
  public static void shuffle(List<?> list, Random random);
  public static void swap(List<?> list, int i, int j);
  public static <T> void fill(List<? super T> list, T value);
  public static void rotate(List<?> list, int distance);
  public static <T extends Comparable<? super T>> T max(Collection<? extends T> c);
  public static <T> T max(Collection<? extends T> c, Comparator<? super T> cmp);
  public static <T extends Comparable<? super T>> T min(Collection<? extends T> c);
  public static <T> T min(Collection<? extends T> c, Comparator<? super T> cmp);
  public static int frequency(Collection<?> c, Object o);
  public static boolean disjoint(Collection<?> a, Collection<?> b);
  public static <T> List<T> nCopies(int n, T value);
  public static <T> List<T> emptyList();
  public static <T> Set<T> emptySet();
  public static <K, V> Map<K, V> emptyMap();
  public static <T> List<T> singletonList(T value);
  public static <T> Set<T> singleton(T value);
  public static <K, V> Map<K, V> singletonMap(K key, V value);
  public static <T> int binarySearch(List<? extends T> list, T key);
  public static <T> int binarySearch(List<? extends T> list, T key, Comparator<? super T> c);
  public static <T> List<T> unmodifiableList(List<? extends T> list);
  public static <T> Set<T> unmodifiableSet(Set<? extends T> set);
  public static <K, V> Map<K, V> unmodifiableMap(Map<? extends K, ? extends V> map);
  public static <T> Collection<T> unmodifiableCollection(Collection<? extends T> c);
  public static <T> List<T> synchronizedList(List<T> list);
  public static <T> Set<T> synchronizedSet(Set<T> set);
  public static <K, V> Map<K, V> synchronizedMap(Map<K, V> map);
  public static <T> boolean addAll(Collection<? super T> c, T... elements);
}
public final class Objects {
  public static boolean equals(Object a, Object b);
  public static int hashCode(Object o);
  public static int hash(Object... values);
  public static boolean isNull(Object o);
  public static boolean nonNull(Object o);
  public static <T> T requireNonNull(T o);
  public static <T> T requireNonNull(T o, String message);
  public static String toString(Object o);
  public static String toString(Object o, String nullDefault);
}
public final class Scanner implements Iterator<String>, java.io.Closeable {
  public Scanner(java.io.InputStream in) {}
  public Scanner(String s) {}
  public String next();
  public int nextInt();
  public long nextLong();
  public short nextShort();
  public byte nextByte();
  public double nextDouble();
  public float nextFloat();
  public boolean nextBoolean();
  public String nextLine();
  public boolean hasNext();
  public boolean hasNextLine();
  public boolean hasNextInt();
  public boolean hasNextLong();
  public boolean hasNextDouble();
  public boolean hasNextFloat();
  public void close();
}
public class Random {
  public Random() {}
  public Random(long seed) {}
  public int nextInt();
  public int nextInt(int bound);
  public long nextLong();
  public boolean nextBoolean();
  public double nextDouble();
  public float nextFloat();
  public void setSeed(long seed);
}
`;

/** The exception classes, from the stdlib's hierarchy, each with Throwable's four constructors. */
function exceptions(pkg: string): string {
  return Object.entries(EXCEPTION_SUPER)
    .filter(([name]) => exceptionPackage(name) === pkg)
    .map(([name, parent]) => {
      const head = name === 'Throwable' ? 'public class Throwable implements java.io.Serializable' : `public class ${name} extends ${parent}`;
      const ctors = `  public ${name}() {}\n  public ${name}(String message) {}\n  public ${name}(String message, Throwable cause) {}\n  public ${name}(Throwable cause) {}`;
      const methods = name !== 'Throwable' ? '' : `
  public String getMessage();
  public String getLocalizedMessage();
  public Throwable getCause();
  public Throwable initCause(Throwable cause);
  public void printStackTrace();
  public void addSuppressed(Throwable t);
  public Throwable[] getSuppressed();`;
      return `${head} {\n${ctors}${methods}\n}`;
    })
    .join('\n');
}

/** Each library package's declarations, as Java source. */
export function libraryStubs(): { packageName: string; source: string }[] {
  return [
    { packageName: 'java.lang', source: JAVA_LANG + exceptions('java.lang') },
    { packageName: 'java.io', source: JAVA_IO + exceptions('java.io') },
    { packageName: 'java.util', source: JAVA_UTIL + exceptions('java.util') },
  ];
}
