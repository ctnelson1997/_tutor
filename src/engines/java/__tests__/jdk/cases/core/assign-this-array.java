public class Main {
  static class Box {
    int[] data = new int[3];
    int size = 0;
    void add(int v) {
      this.data[this.size] = v;
      this.size++;
    }
  }
  public static void main(String[] args) {
    Box b = new Box();
    b.add(7);
    b.add(8);
    System.out.println(b.size + " " + b.data[0] + " " + b.data[1]);
  }
}
