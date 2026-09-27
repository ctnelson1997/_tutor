public class Main {
  public static void main(String[] args) {
    String poem = """
        Roses are red,
          violets are blue.
        """;
    System.out.print(poem);

    String noTrailingNewline = """
        one
        two""";
    System.out.println("[" + noTrailingNewline + "]");

    String escapes = """
        tab:\there
        quote: "hi" and \"""triple\"""
        kept space:\s
        joined \
        line
        """;
    System.out.print(escapes);

    String indentedClose = """
            deep
          """;
    System.out.print("[" + indentedClose + "]");

    String blankLines = """
        a

        b
        """;
    System.out.println(blankLines.length());

    String literals = "tab\tquote\"back\\slash\\n" + '\'' + 'A' + "B";
    System.out.println(literals);
    char octal = '\101';
    System.out.println(octal + " " + "\060\61");
  }
}
