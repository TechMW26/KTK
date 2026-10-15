/** Shared level/round plaque for local and online matches. */
export function RoundMedallion({ level, round, total }: { level: number; round: number; total?: number }) {
  return (
    <div className="round-medallion" aria-label={`Level ${level}, round ${round}${total ? ` of ${total}` : ""}`}>
      <small>LEVEL {level}</small>
      <strong>{String(round).padStart(2, "0")}</strong>
      <span className="round-caption">{total ? `ROUND OF ${total}` : "ROUND"}</span>
    </div>
  );
}