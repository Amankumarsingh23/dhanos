export function SummaryFigure({
  label,
  value,
  caption,
  emphasize,
}: {
  label: string;
  value: string;
  caption?: string;
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
      {caption && (
        <p className="text-muted-foreground mt-0.5 text-xs">{caption}</p>
      )}
    </div>
  );
}
