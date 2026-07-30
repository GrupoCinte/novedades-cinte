'use strict';

function parseHex(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16)
    };
}

function toHex({ r, g, b }) {
    const c = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpColor(a, b, t) {
    const c1 = parseHex(a);
    const c2 = parseHex(b);
    const u = Math.min(1, Math.max(0, t));
    return toHex({
        r: c1.r + (c2.r - c1.r) * u,
        g: c1.g + (c2.g - c1.g) * u,
        b: c1.b + (c2.b - c1.b) * u
    });
}

function scoreColor(n) {
    const score = Math.min(100, Math.max(0, Number(n) || 0));
    if (score <= 50) return lerpColor('#ef4444', '#eab308', score / 50);
    return lerpColor('#eab308', '#22c55e', (score - 50) / 50);
}

module.exports = {
    lerpColor,
    scoreColor
};
