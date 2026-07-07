const fs = require('fs');
const path = require('path');

const appsDir = path.join(__dirname, 'apps');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else if (dirPath.endsWith('.js') || dirPath.endsWith('.jsx')) {
            callback(dirPath);
        }
    });
}

let modifiedFiles = 0;

walkDir(appsDir, (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Si ya fue migrado, o no contiene fetch, ignoramos (excepciones de fetch global)
    if (!content.includes('fetch(') || filePath.includes('api-client') || filePath.includes('shared')) {
        return;
    }
    
    // Reemplazar fetch por apiFetch
    let newContent = content.replace(/\bfetch\(/g, 'apiFetch(');
    
    // Eliminar headers o credentials que ya inyecta apiFetch (opcional, apiFetch los sobreescribe pero es más limpio)
    // No tocaremos eso con regex porque es frágil. Solo cambiar fetch por apiFetch funciona.
    
    // Si se usó apiFetch y no está importado, importarlo
    if (newContent.includes('apiFetch(') && !newContent.includes('import { apiFetch }')) {
        // Encontrar la última importación para insertar después
        const importRegex = /import\s+.*?;?\n/g;
        let lastImportIndex = 0;
        let match;
        while ((match = importRegex.exec(newContent)) !== null) {
            lastImportIndex = match.index + match[0].length;
        }
        
        const importStmt = "import { apiFetch } from '@cinte/api-client';\n";
        
        if (lastImportIndex > 0) {
            newContent = newContent.slice(0, lastImportIndex) + importStmt + newContent.slice(lastImportIndex);
        } else {
            // No imports found
            newContent = importStmt + newContent;
        }
    }
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        modifiedFiles++;
        console.log('Migrado:', filePath);
    }
});

console.log(`Migración completada. Archivos modificados: ${modifiedFiles}`);
