import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import {
    NOCTURNO_HOURS,
    clampNocturnoHhMm,
    nocturnoMinutesForHour
} from './mallaNocturnoConfig.js';

function pad2(n) {
    return String(n).padStart(2, '0');
}

function toHhMm(h, m) {
    return `${pad2(h)}:${pad2(m)}`;
}

function minutesForHour(hour, excludeTime) {
    const [exH, exM] = excludeTime ? excludeTime.split(':').map((x) => parseInt(x, 10)) : [null, null];
    return nocturnoMinutesForHour(hour).filter((m) => !(hour === exH && m === exM));
}

function hoursWithOptions(excludeTime) {
    return NOCTURNO_HOURS.filter((h) => minutesForHour(h, excludeTime).length > 0);
}

function pickValidTime(h, m, excludeTime, fallback) {
    const mins = minutesForHour(h, excludeTime);
    if (mins.includes(m)) return toHhMm(h, m);
    if (mins.length > 0) return toHhMm(h, mins[0]);
    const hours = hoursWithOptions(excludeTime);
    if (hours.length > 0) {
        const nh = hours[0];
        const nm = minutesForHour(nh, excludeTime)[0];
        return toHhMm(nh, nm);
    }
    return fallback;
}

/**
 * Selector 24 h con las mismas franjas nocturnas (18:00–06:00) para inicio y fin.
 * @param {string} [excludeTime] HH:mm que no puede elegirse (la otra hora del par).
 */
export function NocturnoTimePicker({
    id,
    field,
    value,
    onChange,
    excludeTime,
    disabled = false,
    fieldClassName = '',
    ariaDescribedBy
}) {
    const fallback = field === 'inicio' ? '22:00' : '06:00';
    const clamped = clampNocturnoHhMm(value, fallback);
    const valid = pickValidTime(
        ...clamped.split(':').map((x) => parseInt(x, 10)),
        excludeTime,
        clamped
    );
    const [hh, mm] = valid.split(':').map((x) => parseInt(x, 10));
    const hours = hoursWithOptions(excludeTime);
    const minutes = minutesForHour(hh, excludeTime);

    const emit = (h, m) => {
        const next = pickValidTime(h, m, excludeTime, valid);
        if (next !== value) onChange(next);
    };

    useEffect(() => {
        if (!disabled && valid !== value) onChange(valid);
    }, [disabled, valid, value, onChange]);

    return (
        <div className="flex w-full items-center gap-1.5">
            <Clock size={16} className="shrink-0 opacity-50" aria-hidden />
            <select
                id={id}
                aria-label={field === 'inicio' ? 'Hora inicio' : 'Hora fin'}
                aria-describedby={ariaDescribedBy}
                disabled={disabled}
                className={`min-w-0 flex-1 text-sm ${fieldClassName}`}
                value={pad2(hh)}
                onChange={(e) => {
                    const newH = parseInt(e.target.value, 10);
                    emit(newH, mm);
                }}
            >
                {hours.map((h) => (
                    <option key={h} value={pad2(h)}>
                        {pad2(h)}
                    </option>
                ))}
            </select>
            <span className="select-none font-semibold tabular-nums" aria-hidden>
                :
            </span>
            <select
                aria-label={field === 'inicio' ? 'Minutos inicio' : 'Minutos fin'}
                disabled={disabled}
                className={`min-w-0 flex-1 text-sm ${fieldClassName}`}
                value={pad2(mm)}
                onChange={(e) => emit(hh, parseInt(e.target.value, 10))}
            >
                {minutes.map((m) => (
                    <option key={m} value={pad2(m)}>
                        {pad2(m)}
                    </option>
                ))}
            </select>
        </div>
    );
}
