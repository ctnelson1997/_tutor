public class Main {
  public static void main(String[] args) {
    try { Integer.parseInt("3000000000"); } catch (NumberFormatException e) { System.out.println(e); }
    try { Integer.parseInt(" 42"); } catch (NumberFormatException e) { System.out.println(e); }
    try { Integer.parseInt("zz", 16); } catch (NumberFormatException e) { System.out.println(e); }
    try { Integer.parseInt(""); } catch (NumberFormatException e) { System.out.println(e); }
    try { Long.parseLong("9223372036854775808"); } catch (NumberFormatException e) { System.out.println(e); }
    try { Short.parseShort("40000"); } catch (NumberFormatException e) { System.out.println(e); }
    try { Byte.parseByte("200"); } catch (NumberFormatException e) { System.out.println(e); }
    System.out.println(Integer.parseInt("+7") + " " + Integer.parseInt("-80000000", 16) + " " + Integer.parseInt("7fffffff", 16) + " " + Long.parseLong("-9223372036854775808"));
    System.out.println(Float.toString(1.0E10f) + " " + (0.1f + 0.2f) + " " + 1.1f * 3 + " " + 100.0f / 3 + " " + (float) 1e-5 + " " + 3.4028235E38f + " " + Float.MIN_VALUE);
    System.out.println((int) 3.9e10 + " " + (int) -3.9e10 + " " + (int) Double.NaN + " " + (long) 1e30 + " " + (char) 65.7 + " " + (byte) 1e10 + " " + (short) -1e10);
    System.out.println(Math.rint(2.5) + " " + Math.rint(3.5) + " " + Math.rint(-2.5) + " " + Math.rint(-0.4) + " " + Math.round(2.5) + " " + Math.round(-2.5) + " " + Math.round(2.5f));
    long m = Long.MIN_VALUE;
    System.out.println(m / -1 + " " + Math.abs(m) + " " + Math.abs(Integer.MIN_VALUE) + " " + (-m) + " " + (Integer.MIN_VALUE / -1) + " " + (7 % -3) + " " + (-7 % 3) + " " + (-7.5 % 2));
    System.out.println((1L << 63) + " " + (1 << 35) + " " + (1L << 67) + " " + (-1 >>> 28) + " " + (-1L >>> 60) + " " + (-16 >> 2) + " " + (8 >> -1));
    System.out.println(Long.toBinaryString(-1L).length() + " " + Long.toHexString(-255L) + " " + Integer.toHexString(-255) + " " + Long.toString(255L, 16) + " " + Long.MAX_VALUE + 1);
    System.out.println(String.format("%d %x %,d %05d", 12345678901L, -1L, 1234567890123L, 42L));
    byte b = 127; b++; short s = -32768; s--; char c = 65535; c++;
    System.out.println(b + " " + s + " " + (int) c);
    float f = 16777216f; f++;
    System.out.println(f + " " + (f == 16777216f));
    int big = Integer.MAX_VALUE; big += 1; long wide = Integer.MAX_VALUE; wide += 1;
    System.out.println(big + " " + wide + " " + (Integer.MAX_VALUE + 1L) + " " + (5 / 2) + " " + (5 / 2.0) + " " + (5L / 2) + " " + ('a' + 'b') + " " + (char) ('a' + 1));
    System.out.println(Math.floorDiv(-7, 2) + " " + Math.floorMod(-7, 2) + " " + Math.floorDiv(-7L, 2L) + " " + Math.floorMod(7, -3) + " " + Math.max(3L, 5) + " " + Math.min(-0.0, 0.0) + " " + Math.abs(-2.5f));
    System.out.println(Long.compare(1L, 2L) + " " + Short.compare((short) 5, (short) 2) + " " + Double.compare(0.0, -0.0) + " " + Double.compare(Double.NaN, 1.0) + " " + Long.sum(Long.MAX_VALUE, 1L) + " " + Integer.toBinaryString(-8).length() + " " + Long.bitCount(-1L));
    double d = 10; int q = 3; d /= q; int n = 7; n /= 2.0;
    System.out.println(d + " " + n + " " + (0.1 + 0.2 == 0.3) + " " + (0.1f + 0.2f == 0.3f) + " " + (float) 0.1 + " " + (double) 0.1f);
  }
}
