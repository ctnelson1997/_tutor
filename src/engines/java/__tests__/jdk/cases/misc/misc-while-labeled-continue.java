public class Main {
  public static void main(String[] args) {
    int i = 0, hits = 0;
    loop:
    while (i < 5) {
      i++;
      for (int j = 0; j < 3; j++) {
        if (j == i) continue loop;
      }
      hits++;
    }
    System.out.println(hits);
  }
}
