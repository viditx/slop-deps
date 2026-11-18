/**
 * scripts/generate-sbom.js
 * Generates an SPDX 2.3 compliant SBOM (Software Bill of Materials)
 * for slop-deps releases using zero runtime dependencies (Node stdlib only).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));

function computeHashes(filePath) {
  const content = fs.readFileSync(filePath);
  return {
    sha1: crypto.createHash('sha1').update(content).digest('hex'),
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  };
}

function getFilesToInclude(dir, prefix = '') {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFilesToInclude(fullPath, relPath));
    } else if (entry.isFile()) {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

export function generateSBOM() {
  const scannedDirs = ['bin', 'src', 'corpus'];
  const rootFiles = ['package.json', 'README.md', 'LICENSE', 'PRIVACY.md'];
  
  const filesList = [];

  for (const rootFile of rootFiles) {
    const fullPath = path.join(rootDir, rootFile);
    if (fs.existsSync(fullPath)) {
      filesList.push({ fullPath, relPath: rootFile });
    }
  }

  for (const dir of scannedDirs) {
    const dirPath = path.join(rootDir, dir);
    filesList.push(...getFilesToInclude(dirPath, dir));
  }

  const spdxFiles = filesList.map((f, idx) => {
    const hashes = computeHashes(f.fullPath);
    return {
      fileName: `./${f.relPath}`,
      SPDXID: `SPDXRef-File-${idx + 1}`,
      checksums: [
        { algorithm: 'SHA1', checksumValue: hashes.sha1 },
        { algorithm: 'SHA256', checksumValue: hashes.sha256 }
      ],
      licenseConcluded: 'MIT',
      copyrightText: 'Copyright (c) 2026 Vidit Patil'
    };
  });

  const sbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${pkg.name}-${pkg.version}`,
    documentNamespace: `https://github.com/viditx/slop-deps/releases/tag/v${pkg.version}/sbom.spdx.json`,
    creationInfo: {
      creators: [
        `Tool: slop-deps-sbom-generator-${pkg.version}`,
        'Organization: viditx'
      ],
      created: new Date().toISOString()
    },
    packages: [
      {
        SPDXID: 'SPDXRef-Package-slop-deps',
        name: pkg.name,
        versionInfo: pkg.version,
        downloadLocation: 'https://github.com/viditx/slop-deps',
        filesAnalyzed: true,
        licenseConcluded: pkg.license || 'MIT',
        licenseDeclared: pkg.license || 'MIT',
        copyrightText: 'Copyright (c) 2026 Vidit Patil',
        description: pkg.description || 'Static sentinel against hallucinated dependencies',
        supplier: 'Person: Vidit Patil'
      }
    ],
    files: spdxFiles,
    relationships: spdxFiles.map((f) => ({
      spdxElementId: 'SPDXRef-Package-slop-deps',
      relationshipType: 'CONTAINS',
      relatedSpdxElement: f.SPDXID
    }))
  };

  return sbom;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, 'sbom.json');
  const sbom = generateSBOM();
  fs.writeFileSync(outputPath, JSON.stringify(sbom, null, 2) + '\n', 'utf-8');
  console.log(`[sbom] Generated SPDX-2.3 SBOM with ${sbom.files.length} verified files at: ${outputPath}`);
}
