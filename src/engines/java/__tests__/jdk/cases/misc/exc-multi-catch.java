public class Main {
  public static void main(String[] args) {
    String[] inputs = {"12", "x", null};
    for (String s : inputs) {
      try {
        System.out.println(Integer.parseInt(s.trim()) * 2);
      } catch (NumberFormatException | NullPointerException e) {
        System.out.println("bad: " + e.getClass().getSimpleName());
      }
    }
  }
}
