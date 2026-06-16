# AUT-530 — QA: tablas ordenables onboarding maestro

## Historia
Como usuario CH quiero ordenar las tablas del onboarding maestro por columna para encontrar registros más rápido.

## Criterios de aceptación
- CA-01: Cabeceras clicables en Personal, Próximos, Bajas, SENA, Staff, Licencias y Extranjeros.
- CA-02: Orden por defecto al abrir: fecha de ingreso / inicio / vencimiento ASC (más antiguo primero).
- CA-03: Segundo click invierte asc/desc y persiste al paginar.
- CA-04: Parámetros `sort`/`dir` inválidos devuelven 400 en API.

## Prueba manual
1. Capital Humano → Personal Activo: verificar F. inicio ASC.
2. Click en Cliente: alternar asc/desc; ir a página 2 y confirmar orden.
3. Repetir en Licencias (Inicio) y Extranjeros (Vence).
