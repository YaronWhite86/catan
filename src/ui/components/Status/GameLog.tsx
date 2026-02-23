import { useRef, useEffect } from 'react';

interface GameLogProps {
  log: string[];
}

export function GameLog({ log }: GameLogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log.length]);

  return (
    <div
      style={{
        maxHeight: 150,
        overflowY: 'auto',
        border: '1px solid #ddd',
        borderRadius: 6,
        padding: 8,
        fontSize: 12,
        backgroundColor: '#fafafa',
      }}
    >
      {log.length === 0 ? (
        <div style={{ color: '#999' }}>No events yet</div>
      ) : (
        log.map((entry, i) => (
          <div key={i} style={{ padding: '1px 0', color: '#555' }}>
            {entry}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}
