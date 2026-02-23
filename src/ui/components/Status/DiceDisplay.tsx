interface DiceDisplayProps {
  dice: [number, number] | null;
}

export function DiceDisplay({ dice }: DiceDisplayProps) {
  if (!dice) return null;

  const dieFaces = ['\u2680', '\u2681', '\u2682', '\u2683', '\u2684', '\u2685'];

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 32 }}>
      <span>{dieFaces[dice[0] - 1]}</span>
      <span>{dieFaces[dice[1] - 1]}</span>
      <span style={{ fontSize: 16, fontWeight: 'bold' }}>= {dice[0] + dice[1]}</span>
    </div>
  );
}
