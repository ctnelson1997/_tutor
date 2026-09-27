public class Main {
  public static void main(String[] args) {
    int found = -1;
    outer:
    for (int i = 0; i < 5; i++) {
      for (int j = 0; j < 5; j++) {
        if (i * j == 6) {
          found = i * 10 + j;
          break outer;
        }
      }
    }
    System.out.println(found);
  }
}
