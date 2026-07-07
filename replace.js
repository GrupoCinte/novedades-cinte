const fs = require('fs');
const path = require('path');

const targetUrl = 'https://tangy-turkeys-occur.loca.lt';

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
            content = content.replace(/https:\/\/[a-zA-Z0-9-]+\.loca\.lt/g, targetUrl);
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log(`Updated ${fullPath}`);
        }
    }
}

walkDir(__dirname);
