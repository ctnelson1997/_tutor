public class Main {
  private int[] data = {5, 6, 7};
  class Walker {
    int pos = 0;
    boolean hasNext() { return pos < data.length; }
    int next() { return data[pos++]; }
  }
  public static void main(String[] args) {
    Main m = new Main();
    Main.Walker w = m.new Walker();
    int sum = 0;
    while (w.hasNext()) sum += w.next();
    System.out.println(sum);
  }
}
