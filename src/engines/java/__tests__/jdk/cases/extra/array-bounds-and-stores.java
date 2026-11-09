import java.util.*;

// #67: System.arraycopy and the Arrays range methods check their arguments
// as the JDK does (an array never changes its length), and arrays are
// covariant but check every store against their element type.
public class Main {
    interface Call { Object run(); }

    static void attempt(String what, Call call) {
        try {
            Object r = call.run();
            System.out.println(what + " -> " + (r instanceof int[] a ? Arrays.toString(a) : r instanceof Object[] o ? Arrays.toString(o) : r));
        } catch (RuntimeException e) {
            System.out.println(what + ": " + e.getClass().getName() + ": " + e.getMessage());
        }
    }

    // The classic "grow the array" exercise, with its off-by-one.
    static int[] grow(int[] data, boolean offByOne) {
        int[] bigger = new int[data.length * 2];
        System.arraycopy(data, 0, bigger, 0, offByOne ? data.length + 1 : data.length);
        return bigger;
    }

    public static void main(String[] args) {
        int[] d = { 10, 20, 30 };
        attempt("grow", () -> grow(d, false));
        attempt("grow off by one", () -> grow(d, true));
        attempt("into a short array", () -> { int[] b = new int[3]; System.arraycopy(new int[5], 0, b, 0, 5); return b; });
        attempt("negative destination", () -> { int[] b = new int[3]; System.arraycopy(d, 0, b, -1, 2); return b; });
        attempt("negative source", () -> { int[] b = new int[3]; System.arraycopy(d, -2, b, 0, 1); return b; });
        attempt("negative length", () -> { int[] b = new int[3]; System.arraycopy(d, 0, b, 0, -1); return b; });
        attempt("null source", () -> { System.arraycopy(null, 0, new int[3], 0, 1); return null; });
        attempt("not an array", () -> { System.arraycopy("x", 0, new int[1], 0, 1); return null; });
        attempt("int into long", () -> { System.arraycopy(new int[2], 0, new long[2], 0, 1); return null; });
        attempt("objects into ints", () -> { System.arraycopy(new Object[2], 0, new int[2], 0, 1); return null; });
        String[] names = new String[3];
        attempt("objects into strings", () -> { System.arraycopy(new Object[] { "a", 1, "c" }, 0, names, 0, 3); return names; });
        System.out.println("copied before the mismatch: " + Arrays.toString(names));
        attempt("overlap", () -> { int[] a = { 1, 2, 3, 4, 5 }; System.arraycopy(a, 0, a, 1, 4); return a; });

        attempt("fill past the end", () -> { int[] a = new int[5]; Arrays.fill(a, 0, 8, 7); return a; });
        attempt("fill backwards", () -> { int[] a = new int[5]; Arrays.fill(a, 3, 1, 9); return a; });
        attempt("fill from -1", () -> { int[] a = new int[5]; Arrays.fill(a, -1, 2, 9); return a; });
        attempt("fill a part", () -> { int[] a = new int[5]; Arrays.fill(a, 1, 3, 9); return a; });
        attempt("sort past the end", () -> { int[] b = { 5, 4, 3, 2, 1 }; Arrays.sort(b, 2, 9); return b; });
        attempt("sort a part", () -> { int[] b = { 5, 4, 3, 2, 1 }; Arrays.sort(b, 1, 4); return b; });
        attempt("copyOfRange backwards", () -> Arrays.copyOfRange(new int[] { 1, 2, 3, 4, 5 }, 4, 2));
        attempt("copyOfRange past the end", () -> Arrays.copyOfRange(new int[] { 1, 2, 3 }, 1, 6));
        attempt("copyOfRange from past the end", () -> Arrays.copyOfRange(new int[] { 1, 2, 3 }, 4, 6));
        attempt("copyOf -1", () -> Arrays.copyOf(new int[] { 1, 2 }, -1));
        attempt("copyOf longer", () -> Arrays.copyOf(new int[] { 1, 2 }, 4));
        attempt("binarySearch backwards", () -> Arrays.binarySearch(new int[] { 1, 2, 3 }, 2, 1, 2));
        attempt("binarySearch past the end", () -> Arrays.binarySearch(new int[] { 1, 2, 3 }, 0, 5, 2));

        // Arrays are covariant; generics aren't.
        attempt("store an Integer", () -> { Object[] objs = new String[2]; objs[1] = Integer.valueOf(1); return objs; });
        attempt("store a String", () -> { Object[] objs = new String[2]; objs[1] = "ok"; return objs; });
        attempt("store a Double", () -> { Number[] ns = new Integer[1]; ns[0] = 2.5; return ns; });
        attempt("store a row", () -> { Object[][] grid = new Integer[2][2]; grid[0] = new String[1]; return null; });
        attempt("fill with an Integer", () -> { Object[] objs = new String[2]; Arrays.fill(objs, 3); return objs; });
        attempt("asList set", () -> { Object[] objs = new String[2]; List<Object> l = Arrays.asList(objs); l.set(0, 1); return objs; });
        try {
            Object[] objs = new String[2];
            objs[0] = 42;
        } catch (ArrayStoreException e) {
            System.out.println("caught " + e);
        }
        int[] data = { 1, 2, 3 };
        data = grow(data, true);
        System.out.println("not reached");
    }
}
