/**
 * Props para `<input type="date" />` y `<input type="month" />`:
 * bloquea escritura por teclado y pegado; el valor se elige con el control nativo (calendario/mes).
 * Colocar al inicio del `<input>`: `{...nativeCalendarOnlyInputProps}`.
 */
export const nativeCalendarOnlyInputProps = {
    onKeyDown(e) {
        if (e.key === 'Tab' || e.key === 'Escape') return;
        e.preventDefault();
    },
    onPaste(e) {
        e.preventDefault();
    },
    onCut(e) {
        e.preventDefault();
    },
    onDrop(e) {
        e.preventDefault();
    }
};
