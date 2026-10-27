export function DiffView({ text }: { text: string }) {
  if (!text.trim()) return <p className="muted pad">No textual changes to show</p>;
  return (
    <pre className="diff-text">
      {text.split("\n").map((l, i) => (
        <div
          key={i}
          className={
            l.startsWith("+") && !l.startsWith("+++")
              ? "add"
              : l.startsWith("-") && !l.startsWith("---")
                ? "del"
                : l.startsWith("@@")
                  ? "hunk"
                  : ""
          }
        >
          {l || " "}
        </div>
      ))}
    </pre>
  );
}
