export function SummaryFigure({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={emphasize ? "text-lg font-semibold" : "text-sm font-medium"}
      >
        {value}
      </p>
    </div>
  );
}
