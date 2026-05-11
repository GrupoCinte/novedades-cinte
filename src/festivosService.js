'use strict';

// Cache en memoria para evitar saturar la API
let festivosCache = new Set();
let lastFetchTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

async function fetchFestivosFromApi(year) {
    const token = (process.env.FESTIVOS_API_TOKEN || '').trim();
    if (!token) {
        console.warn('FESTIVOS_API_TOKEN no está configurado en .env. No se detectarán festivos.');
        return new Set();
    }

    try {
        const url = `https://www.festivos.com.co/api/v1/festivos?year=${year}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await globalThis.fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`Error fetching festivos: \${response.status} \${response.statusText}`);
            return new Set();
        }

        const data = await response.json();
        
        // La API puede devolver { festivos: [...] } o simplemente [...]
        // Extraemos todas las fechas YYYY-MM-DD que encontremos
        const foundDates = new Set();
        const strData = JSON.stringify(data);
        const regex = /"(\d{4}-\d{2}-\d{2})"/g;
        let match;
        while ((match = regex.exec(strData)) !== null) {
            foundDates.add(match[1]);
        }

        return foundDates;
    } catch (error) {
        console.error('Failed to fetch festivos from API:', error.message);
        return new Set();
    }
}

async function getFestivosSet() {
    const now = Date.now();
    // Refrescar caché si caducó o está vacío
    if (festivosCache.size === 0 || (now - lastFetchTime) > CACHE_TTL_MS) {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        
        const [festivosCurrent, festivosNext] = await Promise.all([
            fetchFestivosFromApi(currentYear),
            fetchFestivosFromApi(nextYear)
        ]);

        const combined = new Set([...festivosCurrent, ...festivosNext]);
        
        if (combined.size > 0) {
            festivosCache = combined;
            lastFetchTime = now;
            console.log(`✅ Festivos cacheados: ${festivosCache.size} fechas detectadas para ${currentYear}-${nextYear}`);
        }
    }
    return festivosCache;
}

/**
 * Devuelve true si la fecha YYYY-MM-DD es festivo
 */
function isFestivo(ymd) {
    if (!ymd || !festivosCache) return false;
    return festivosCache.has(String(ymd).trim());
}

/**
 * Inicia la carga en background
 */
function initFestivosCache() {
    getFestivosSet().catch(err => console.error('Error al inicializar festivos:', err));
}

module.exports = {
    getFestivosSet,
    isFestivo,
    initFestivosCache
};
