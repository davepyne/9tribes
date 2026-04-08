import { useEffect, useRef, useState } from 'react';
import { EventToast } from './EventToast';

type EventToastStackProps = {
  events: Array<{ sequence?: number; round: number; kind?: 'move' | 'turn'; message: string }>;
};

type VisibleEvent = {
  id: number;
  round: number;
  kind?: 'move' | 'turn';
  message: string;
};

export function EventToastStack({ events }: EventToastStackProps) {
  const [visible, setVisible] = useState<VisibleEvent[]>([]);
  const lastSeqRef = useRef(-1);

  useEffect(() => {
    const newEvents = events.filter((e) => (e.sequence ?? 0) > lastSeqRef.current);
    if (newEvents.length === 0) return;

    lastSeqRef.current = Math.max(...newEvents.map((e) => e.sequence ?? 0));

    const added: VisibleEvent[] = newEvents.map((e, i) => ({
      id: Date.now() + i,
      round: e.round,
      kind: e.kind,
      message: e.message,
    }));

    setVisible((prev) => [...added, ...prev].slice(0, 4));

    // Auto-dismiss each after 2400ms
    for (const item of added) {
      setTimeout(() => {
        setVisible((prev) => prev.filter((v) => v.id !== item.id));
      }, 2400);
    }
  }, [events]);

  if (visible.length === 0) return null;

  return <EventToast events={visible} />;
}
