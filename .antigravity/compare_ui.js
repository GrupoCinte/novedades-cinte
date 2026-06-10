import fs from 'fs';
import path from 'path';

const reactFrontendSrc = 'c:/Projects/novedades-cinte/react-frontend/src';
const appsDir = 'c:/Projects/novedades-cinte/apps';
const packagesDir = 'c:/Projects/novedades-cinte/packages';
const outputPath = 'c:/Projects/novedades-cinte/.antigravity/compare_results.txt';

// Recursively find all files in a directory
function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== '.turbo') {
        results = results.concat(getFiles(filePath));
      }
    } else {
      results.push(filePath);
    }
  });
  return results;
}

const oldFiles = getFiles(reactFrontendSrc);
const appFiles = getFiles(appsDir);
const pkgFiles = getFiles(packagesDir);
const newFiles = [...appFiles, ...pkgFiles];

const oldBaseToPath = {};
oldFiles.forEach(f => {
  const rel = path.relative(reactFrontendSrc, f).replace(/\\/g, '/');
  oldBaseToPath[rel] = f;
});

const newBaseToPaths = {};
newFiles.forEach(f => {
  let rel;
  if (f.startsWith(appsDir)) {
    const parts = path.relative(appsDir, f).replace(/\\/g, '/').split('/');
    const srcIndex = parts.indexOf('src');
    if (srcIndex !== -1) {
      rel = parts.slice(srcIndex + 1).join('/');
    } else {
      rel = parts.slice(1).join('/');
    }
  } else if (f.startsWith(packagesDir)) {
    const parts = path.relative(packagesDir, f).replace(/\\/g, '/').split('/');
    const srcIndex = parts.indexOf('src');
    if (srcIndex !== -1) {
      rel = parts.slice(srcIndex + 1).join('/');
    } else {
      rel = parts.slice(1).join('/');
    }
  }
  if (rel) {
    if (!newBaseToPaths[rel]) newBaseToPaths[rel] = [];
    newBaseToPaths[rel].push(f);
  }
});

const results = [];

for (const [relPath, oldPath] of Object.entries(oldBaseToPath)) {
  const matchingNewPaths = newBaseToPaths[relPath] || [];
  if (matchingNewPaths.length === 0) {
    const basename = path.basename(oldPath);
    const matches = newFiles.filter(f => path.basename(f) === basename);
    if (matches.length > 0) {
      matches.forEach(m => {
        compare(relPath, oldPath, m);
      });
    } else {
      results.push({
        relPath,
        status: 'MISSING_IN_MFE',
        oldPath,
      });
    }
  } else {
    matchingNewPaths.forEach(newPath => {
      compare(relPath, oldPath, newPath);
    });
  }
}

function compare(relPath, oldPath, newPath) {
  const oldContent = fs.readFileSync(oldPath, 'utf8').trim().replace(/\r\n/g, '\n');
  const newContent = fs.readFileSync(newPath, 'utf8').trim().replace(/\r\n/g, '\n');

  if (oldContent === newContent) {
    results.push({
      relPath,
      status: 'IDENTICAL',
    });
  } else {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    // Ignore simple re-exports (usually 1-3 lines long)
    if (newLines.length <= 5 && newContent.includes('export') && (newContent.includes('@cinte') || newContent.includes('./') || newContent.includes('../'))) {
      return;
    }
    
    results.push({
      relPath,
      oldPath: path.relative('c:/Projects/novedades-cinte', oldPath).replace(/\\/g, '/'),
      newPath: path.relative('c:/Projects/novedades-cinte', newPath).replace(/\\/g, '/'),
      status: 'DIFFERENT',
      oldLineCount: oldLines.length,
      newLineCount: newLines.length,
    });
  }
}

// Write to output file
let outputStr = '=== COMPARISON REPORT ===\n\n';
const missing = results.filter(r => r.status === 'MISSING_IN_MFE');
const different = results.filter(r => r.status === 'DIFFERENT');

outputStr += `Missing files in MFE (${missing.length}):\n`;
missing.forEach(m => {
  outputStr += `- ${m.relPath} (Old path: ${m.oldPath})\n`;
});

outputStr += `\nDifferent files in MFE (${different.length}):\n`;
different.forEach(d => {
  outputStr += `- ${d.relPath}\n  Old: ${d.oldPath} (${d.oldLineCount} lines)\n  New: ${d.newPath} (${d.newLineCount} lines)\n\n`;
});

fs.writeFileSync(outputPath, outputStr, 'utf8');
console.log('Comparison complete. Written to ' + outputPath);
