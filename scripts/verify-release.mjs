#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const requiredFields = ['id', 'name', 'version', 'minAppVersion', 'description', 'permissions'];
const requiredPermissions = ['clipboard-read', 'clipboard-write'];
const releaseAssets = ['main.js', 'styles.css', 'manifest.json'];
let errors = [];

// Check manifest.json
console.log('Verifying manifest.json...');
try {
  const manifestPath = path.join(rootDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  
  // Check required fields
  for (const field of requiredFields) {
    if (!manifest[field]) {
      errors.push(`✗ manifest.json missing required field: ${field}`);
    } else {
      console.log(`✓ manifest.json has field: ${field}`);
    }
  }
  
  // Check permissions
  if (manifest.permissions) {
    for (const perm of requiredPermissions) {
      if (manifest.permissions.includes(perm)) {
        console.log(`✓ manifest.json includes permission: ${perm}`);
      } else {
        errors.push(`✗ manifest.json missing permission: ${perm}`);
      }
    }
  }
} catch (error) {
  errors.push(`✗ Failed to parse manifest.json: ${error.message}`);
}

// Check release assets exist
console.log('\nVerifying release assets...');
for (const asset of releaseAssets) {
  const assetPath = path.join(rootDir, asset);
  if (fs.existsSync(assetPath)) {
    console.log(`✓ Release asset exists: ${asset}`);
  } else {
    console.log(`⚠ Release asset not found (expected after build): ${asset}`);
  }
}

// Report results
console.log('\n' + '='.repeat(50));
if (errors.length > 0) {
  console.error('\nVerification failed with the following errors:\n');
  errors.forEach(err => console.error(err));
  process.exit(1);
} else {
  console.log('✓ All release requirements verified successfully!');
  process.exit(0);
}
