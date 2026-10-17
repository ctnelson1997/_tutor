import java.util.*;
public class Main {
  static class Team {
    List<String> members = new ArrayList<>();
  }
  public static void main(String[] args) {
    Team t = new Team();
    t.members.add("A");
    t.members.add("B");
    System.out.println(t.members.size());
  }
}
