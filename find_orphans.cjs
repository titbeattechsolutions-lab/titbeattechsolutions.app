const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            getAllFiles(filePath, fileList);
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const allFiles = getAllFiles(srcDir);
const importsMap = new Map(); // targetFile -> Set of importerFiles

allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const regex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        let importPath = match[1];
        if (importPath.startsWith('.')) {
            importPath = path.resolve(path.dirname(file), importPath);
        } else if (importPath.startsWith('@/')) {
            importPath = path.join(srcDir, importPath.slice(2));
        } else {
            continue; // Node module
        }
        
        // Try to resolve the extension
        let target = '';
        if (fs.existsSync(importPath) && fs.statSync(importPath).isFile()) target = importPath;
        else if (fs.existsSync(importPath + '.tsx')) target = importPath + '.tsx';
        else if (fs.existsSync(importPath + '.ts')) target = importPath + '.ts';
        else if (fs.existsSync(importPath + '/index.tsx')) target = importPath + '/index.tsx';
        else if (fs.existsSync(importPath + '/index.ts')) target = importPath + '/index.ts';

        if (target) {
            if (!importsMap.has(target)) importsMap.set(target, new Set());
            importsMap.get(target).add(file);
        }
    }
});

// Build a set of reachable files starting from entry points
const entryPoints = [
    path.join(srcDir, 'main.tsx'),
    path.join(srcDir, 'App.tsx')
].filter(p => fs.existsSync(p));

const reachable = new Set();
const queue = [...entryPoints];
while (queue.length > 0) {
    const current = queue.shift();
    if (!reachable.has(current)) {
        reachable.add(current);
        // Find what `current` imports by looking at the Map keys whose value set contains `current`
        for (const [target, importers] of importsMap.entries()) {
            if (importers.has(current)) {
                queue.push(target);
            }
        }
    }
}

const schoolComponentsDir = path.join(srcDir, 'components', 'school');
const schoolFiles = allFiles.filter(f => f.startsWith(schoolComponentsDir));

console.log("--- School Components Audit ---");
schoolFiles.forEach(file => {
    const relPath = path.relative(srcDir, file);
    const importers = Array.from(importsMap.get(file) || []).map(f => path.relative(srcDir, f));
    const isReachable = reachable.has(file);
    console.log(`${relPath} | Imported By: ${importers.join(', ') || 'NONE'} | Reachable: ${isReachable}`);
});

console.log("\n--- Checking school-store.ts ---");
const storePath = path.join(srcDir, 'lib', 'school-store.ts');
const storeImporters = Array.from(importsMap.get(storePath) || []).map(f => path.relative(srcDir, f));
console.log(`lib/school-store.ts | Imported By: ${storeImporters.join(', ') || 'NONE'} | Reachable: ${reachable.has(storePath)}`);

console.log("\n--- Checking for ALL zero-importer files outside main/App ---");
allFiles.forEach(file => {
    const relPath = path.relative(srcDir, file);
    if (!importsMap.has(file) && !['main.tsx', 'App.tsx'].includes(relPath)) {
        console.log(`Orphan: ${relPath}`);
    }
});

