import java.util.*;
public class Main {
  public static void main(String[] args) {
    ArrayList<String> names = new ArrayList<>();
    names.add("Ann");
    names.add(0, "Zoe");
    System.out.println(names + " " + names.indexOf("Ann") + " " + names.contains("Bob"));
  }
}
