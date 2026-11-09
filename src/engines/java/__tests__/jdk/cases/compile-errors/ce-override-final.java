public class Main {
    static class A { final void m() {} }
    static class B extends A { void m() {} }
    public static void main(String[] args) { new B().m(); }
}
