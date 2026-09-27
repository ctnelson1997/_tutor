public class Main {
  public static void main(String[] args) {
    int day = 2;
    String name = switch (day) {
      case 1 -> "Mon";
      case 2 -> "Tue";
      default -> "Other";
    };
    System.out.println(name);
  }
}
