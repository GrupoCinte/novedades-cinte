const { diasHabilesTranscurridos } = require('../src/reubicaciones/reubicacionesCalendario');
const festivosMock = new Set([
    '2026-08-07', 
    '2026-08-17'  
]);

console.log('TEST 1 (06/08 to 28/08):', diasHabilesTranscurridos('2026-08-06', '2026-08-28', festivosMock));
console.log('TEST 2 (14/08 to 28/08):', diasHabilesTranscurridos('2026-08-14', '2026-08-28', festivosMock));
