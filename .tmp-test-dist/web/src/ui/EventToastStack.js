import { useEffect, useRef, useState } from 'react';
import { EventToast } from './EventToast.js';
export function EventToastStack({ events }) {
    const [visible, setVisible] = useState([]);
    const lastSeqRef = useRef(-1);
    useEffect(() => {
        const newEvents = events.filter((e) => (e.sequence ?? 0) > lastSeqRef.current);
        if (newEvents.length === 0)
            return;
        lastSeqRef.current = Math.max(...newEvents.map((e) => e.sequence ?? 0));
        const added = newEvents.map((e, i) => ({
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
    if (visible.length === 0)
        return null;
    return <EventToast events={visible}/>;
}
