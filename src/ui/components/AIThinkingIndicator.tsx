interface AIThinkingIndicatorProps {
  playerName: string;
  color: string;
}

export function AIThinkingIndicator({ playerName, color }: AIThinkingIndicatorProps) {
  return (
    <div style={{
      padding: '10px 16px',
      backgroundColor: `${color}15`,
      border: `2px solid ${color}`,
      borderRadius: 8,
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <div style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        backgroundColor: color,
        animation: 'ai-pulse 1s ease-in-out infinite',
      }} />
      <span style={{ color, fontWeight: 'bold', fontSize: 14 }}>
        {playerName} is thinking...
      </span>
      <style>{`
        @keyframes ai-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
