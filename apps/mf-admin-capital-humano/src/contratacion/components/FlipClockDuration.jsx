import { useEffect, useRef, useState } from 'react';
import { durationToParts } from '../utils/durationMetrics.js';
import './flipClock.css';

function FlipDigit({ value, themeCls }) {
    const [display, setDisplay] = useState(value);
    const [prev, setPrev] = useState(value);
    const [flipping, setFlipping] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        if (value === display) return undefined;
        setPrev(display);
        setFlipping(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setDisplay(value);
            setFlipping(false);
        }, 450);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [value, display]);

    const top = flipping ? prev : display;
    const bottom = display;

    return (
        <div className={`fc-digit ${themeCls} ${flipping ? 'fc-flip' : ''}`} aria-hidden>
            <div className="fc-digit-top">
                <span className="fc-digit-face">{top}</span>
            </div>
            <div className="fc-digit-bottom">
                <span className="fc-digit-face">{bottom}</span>
            </div>
            {flipping ? (
                <div className="fc-flap">
                    <span className="fc-digit-face">{prev}</span>
                </div>
            ) : null}
        </div>
    );
}

function DigitPair({ n, themeCls }) {
    const str = String(n).padStart(2, '0');
    return (
        <div className="fc-pair">
            <FlipDigit value={str[0]} themeCls={themeCls} />
            <FlipDigit value={str[1]} themeCls={themeCls} />
        </div>
    );
}

/**
 * Reloj flip HH:MM:SS (estilo FlipClock.js) para duraciones en vivo.
 */
export default function FlipClockDuration({ totalMs, label, isLight, accent = 'default' }) {
    const themeCls = isLight ? 'fc-light' : 'fc-dark';
    const { h, m, s } = durationToParts(totalMs);
    const labelColor =
        accent === 'wait'
            ? isLight
                ? 'text-amber-700'
                : 'text-amber-300'
            : isLight
              ? 'text-sky-700'
              : 'text-sky-300';

    return (
        <div className="fc-wrap" role="timer" aria-label={`${label} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}>
            <span className={`fc-label ${labelColor}`}>{label}</span>
            <div className="fc-row">
                <div className="fc-unit">
                    <DigitPair n={h} themeCls={themeCls} />
                    <span className={`fc-unit-label ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Horas</span>
                </div>
                <span className={`fc-sep ${themeCls}`}>:</span>
                <div className="fc-unit">
                    <DigitPair n={m} themeCls={themeCls} />
                    <span className={`fc-unit-label ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Min</span>
                </div>
                <span className={`fc-sep ${themeCls}`}>:</span>
                <div className="fc-unit">
                    <DigitPair n={s} themeCls={themeCls} />
                    <span className={`fc-unit-label ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Seg</span>
                </div>
            </div>
        </div>
    );
}
