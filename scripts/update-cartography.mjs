import { createHash } from 'crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = 'C:\\Users\\fosbo\\war-civ-v2';
const includePatterns = [/src\/.*\.ts$/, /.*\.json$/, /.*\.ts$/];
const excludePatterns = [/tests\//, /\.test\./, /\.spec\./, /node_modules\//, /dist\//, /\.slim\//];

function walk(dir) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.match(/node_modules|dist|\.slim|\.git/)) results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function matchesPatterns(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  if (excludePatterns.some(p => normalized.match(p))) return false;
  return includePatterns.some(p => normalized.match(p));
}

function md5(filePath) {
  const data = readFileSync(filePath);
  return createHash('md5').update(data).digest('hex');
}

// Read current cartography
const cartoPath = join(ROOT, '.slim', 'cartography.json');
const current = JSON.parse(readFileSync(cartoPath, 'utf-8'));

// Scan all files
const allFiles = walk(ROOT);
const tracked = allFiles.filter(f => matchesPatterns(relative(ROOT, f)));

const fileHashes = {};
for (const f of tracked) {
  const rel = relative(ROOT, f).replace(/\\/g, '\\\\');
  fileHashes[rel] = md5(f);
}

// Compute folder hashes
const folderSet = new Set();
for (const rel of Object.keys(fileHashes)) {
  const parts = rel.split('\\\\');
  for (let i = 1; i < parts.length; i++) {
    folderSet.add(parts.slice(0, i).join('/'));
  }
}

const folderHashes = {};
for (const folder of folderSet) {
  const folderKey = folder.replace(/\//g, '\\\\');
  folderHashes[folderKey] = '';
}

current.file_hashes = fileHashes;
current.folder_hashes = folderHashes;
current.metadata.last_run = new Date().toISOString();

writeFileSync(cartoPath, JSON.stringify(current, null, 2) + '\n');

// Report drift
const oldHashes = Object.keys(JSON.parse(readFileSync(cartoPath, 'utf-8')).file_hashes);
console.log(`Updated cartography: ${Object.keys(fileHashes).length} files tracked`);
