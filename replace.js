const fs = require('fs');
const path = require('path');

const targetUrl = 'https://nnywh-201-244-169-15.free.pinggy.net';

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git') {
                walkDir(fullPath);
            }
        } else if (file === '.env.production') {
            let content = fs.readFileSync(fullPath, 'utf8');
            content = content.replace(/VITE_API_URL=.*/g, `VITE_API_URL=${targetUrl}`);
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log(`Updated ${fullPath}`);
        }
    }
}

walkDir(__dirname);
