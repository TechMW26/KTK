/** Shared level/round plaque for local and online matches. */
export function RoundMedallion({ level, round }: { level: number; round: number }) {
  return (
    <div className="round-medallion" aria-label={`Level ${level}, round ${round}`}>
      <small>LEVEL {level}</small>
      <strong>{String(round).padStart(2, "0")}</strong>
      <span className="round-caption">ROUND</span>
    </div>
  );
}
