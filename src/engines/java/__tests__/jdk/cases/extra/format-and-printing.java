import java.util.*;
public class Main {
  static class Pt { int x; }
  static void f(String fmt, Object... args) {
    try { System.out.println(fmt + " -> [" + String.format(fmt, args) + "]"); }
    catch (Exception e) { System.out.println(fmt + " -> " + e); }
  }
  public static void main(String[] args) {
    f("%.1f", 0.15); f("%.2f", 1.005); f("%.2f", 2.675); f("%.0f", 0.5); f("%.0f", 1.5); f("%.0f", 2.5);
    f("%f", 3.14159265358979); f("%.3f", 1e-7); f("%.20f", 0.1); f("%.2f", 1e20); f("%.1f", 123456789.25);
    f("%10.3f|", Math.PI); f("%-10.2f|", Math.PI); f("%+.2f", 2.5); f("% .2f", 2.5); f("%08.2f", -3.14159);
    f("%,.2f", 1234567.891); f("%,d", -1234567); f("%(.2f", -2.5); f("%.2f", -0.0); f("%.2f", -0.001);
    f("%f", Double.NaN); f("%8.2f|", Double.POSITIVE_INFINITY); f("%.2f", Double.NEGATIVE_INFINITY);
    f("%e", 12.3456); f("%.2e", 0.000123456); f("%e", 0.0); f("%.0e", 5.5); f("%E", 1e100); f("%.3e", 9.9995);
    f("%g", 0.0); f("%g", 1.0); f("%g", 123456.0); f("%g", 1234567.0); f("%g", 0.0001); f("%g", 0.00001234); f("%.3g", 3.14159); f("%.0g", 12.5); f("%G", 1e-10);
    f("%.2f", 1.1f); f("%e", 1.1f); f("%s", 1.1f); f("%s", 1e7); f("%s", 0.1 + 0.2);
    f("%d", 3.5); f("%f", 3); f("%d", 'c'); f("%c", "s"); f("%x", 2.5); f("%d"); f("%d %d", 1); f("%q", 1); f("%5.2d", 3);
    f("%c", 65); f("%c", 'z'); f("%b", 5); f("%b", (Object) null); f("%10s|", "hi"); f("%-10s|", "hi"); f("%.2s", "hello"); f("%S", "hi");
    f("%x", -1); f("%X", 255L); f("%o", 8); f("%05d", -42); f("%+d", 5); f("%h", "hi");
    f("%1$s %1$s %2$d", "a", 7); f("%n");
    char[] cs = {'h', 'i'};
    System.out.println(cs);
    System.out.print(cs); System.out.println();
    System.out.println(String.valueOf(cs) + " " + new StringBuilder().append(cs).toString());
    int[] a = {1, 2, 3};
    String s = "" + a;
    System.out.println(s.startsWith("[I@") + " " + ("" + new double[1]).startsWith("[D@") + " " + ("" + new String[1]).startsWith("[Ljava.lang.String;@") + " " + ("" + new int[1][1]).startsWith("[[I@") + " " + ("" + new Pt[1]).startsWith("[LMain$Pt;@") + " " + ("" + new char[1]).startsWith("[C@") + " " + ("" + new long[1]).startsWith("[J@") + " " + ("" + new boolean[1]).startsWith("[Z@"));
    System.out.println(("" + new Pt()).startsWith("Main$Pt@") + " " + ("" + new Object()).startsWith("java.lang.Object@") + " " + ("" + a).length());
    System.out.println(Double.toString(1e7) + " " + 123456789.0 + " " + 0.0001 + " " + 1e21 + " " + 1500000.0 * 12 + " " + Double.MIN_VALUE + " " + Double.MAX_VALUE + " " + 100.0 + " " + 0.001 + " " + 9999999.0 + " " + 2e-3 + " " + (0.1 + 0.2) + " " + 1e-300);
  }
}
