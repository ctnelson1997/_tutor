import java.util.*;

public class Main {
  static class Box<T> {
    Object item;
    Box(Object item) { this.item = item; }
    @SuppressWarnings("unchecked")
    T get() { return (T) item; }
  }

  public static void main(String[] args) {
    Object o = "hello";
    String s = (String) o;
    System.out.println(s.length());

    Object num = 42;
    Integer i = (Integer) num;
    System.out.println(i + 1);

    try {
      Double d = (Double) num;
      System.out.println("not reached " + d);
    } catch (ClassCastException e) {
      System.out.println("CCE Integer to Double");
    }

    try {
      String bad = (String) num;
      System.out.println("not reached " + bad);
    } catch (ClassCastException e) {
      System.out.println("CCE Integer to String");
    }

    Object nothing = null;
    String fromNull = (String) nothing;
    System.out.println(fromNull);

    Object list = new ArrayList<String>();
    List<?> asList = (List<?>) list;
    System.out.println(asList.size());
    try {
      Map<?, ?> asMap = (Map<?, ?>) list;
      System.out.println("not reached " + asMap);
    } catch (ClassCastException e) {
      System.out.println("CCE ArrayList to Map");
    }

    // An unchecked cast to a type variable isn't checked when it runs.
    Box<Integer> box = new Box<>("not a number");
    Object inside = box.get();
    System.out.println(inside);

    Object ints = new int[] {1, 2, 3};
    int[] back = (int[]) ints;
    System.out.println(back.length);
  }
}
