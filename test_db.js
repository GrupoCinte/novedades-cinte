const { Pool } = require('pg');

async function test() {
    const configs = [
        { user: 'cinte_app', password: 'cinte_app' },
        { user: 'cinte_app', password: '' },
        { user: 'postgres', password: 'postgres' },
        { user: 'postgres', password: '' },
        { user: 'postgres', password: 'password' },
        { user: 'admin', password: 'admin' },
        { user: 'admin', password: '' },
    ];

    for (const config of configs) {
        console.log(`Testing ${config.user} with password "${config.password}"`);
        const pool = new Pool({
            host: 'localhost',
            port: 5432,
            database: 'postgres',
            user: config.user,
            password: config.password
        });
        try {
            await pool.query('SELECT NOW()');
            console.log(`Success with ${config.user} / ${config.password}`);
            process.exit(0);
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        } finally {
            await pool.end();
        }
    }
}

test();
