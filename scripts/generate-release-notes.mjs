#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Get the version from manifest.json
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf-8'));
const version = manifest.version;

// Get the previous version tag
let previousTag = null;
try {
  const tags = execSync('git tag --sort=-v:refname', { cwd: rootDir, encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(tag => tag);
  
  if (tags.length > 0) {
    // Find the previous tag (before the current version)
    const currentTagIndex = tags.findIndex(tag => tag === version);
    if (currentTagIndex >= 0 && currentTagIndex < tags.length - 1) {
      previousTag = tags[currentTagIndex + 1];
    } else if (tags.length > 0 && tags[0] !== version) {
      previousTag = tags[0];
    }
  }
} catch {
  // No tags yet, use initial commit
  previousTag = null;
}

// Get commit messages between tags
let commits = [];
try {
  let command = 'git log --oneline --no-decorate';
  
  if (previousTag) {
    command += ` ${previousTag}..HEAD`;
  }
  
  const output = execSync(command, { cwd: rootDir, encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(line => line);
  
  commits = output.map(line => {
    const match = line.match(/^[a-f0-9]+ (.+)$/);
    return match ? match[1] : line;
  });
} catch {
  // Fallback if git command fails
  commits = [];
}

// Categorize commits
const categories = {
  'Added': [],
  'Fixed': [],
  'Changed': [],
  'Removed': [],
  'Other': []
};

commits.forEach(commit => {
  const msg = commit.toLowerCase();
  if (msg.includes('add') || msg.includes('new') || msg.includes('feature')) {
    categories.Added.push(commit);
  } else if (msg.includes('fix') || msg.includes('bug')) {
    categories.Fixed.push(commit);
  } else if (msg.includes('chang') || msg.includes('update') || msg.includes('modify')) {
    categories.Changed.push(commit);
  } else if (msg.includes('remov') || msg.includes('delete')) {
    categories.Removed.push(commit);
  } else {
    categories.Other.push(commit);
  }
});

// Build release notes
const date = new Date().toISOString().split('T')[0];
let releaseNotes = `## Version ${version} - ${date}\n\n`;

// Add section for each category
let hasSections = false;
for (const [category, items] of Object.entries(categories)) {
  if (items.length > 0) {
    hasSections = true;
    releaseNotes += `### ${category}\n\n`;
    items.forEach(item => {
      // Capitalize first letter
      const capitalizedItem = item.charAt(0).toUpperCase() + item.slice(1);
      releaseNotes += `- ${capitalizedItem}\n`;
    });
    releaseNotes += '\n';
  }
}

// If no categorized commits, show all
if (!hasSections && commits.length > 0) {
  releaseNotes += '### Changes\n\n';
  commits.forEach(item => {
    const capitalizedItem = item.charAt(0).toUpperCase() + item.slice(1);
    releaseNotes += `- ${capitalizedItem}\n`;
  });
  releaseNotes += '\n';
}

// Add default message if no commits
if (commits.length === 0) {
  releaseNotes += '### Release\n\n- Version bump and release artifacts\n\n';
}

// Add verification note
releaseNotes += `### Verification\n\nThis release includes artifact attestations for provenance verification. Learn more about [artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/).\n`;

console.log(releaseNotes);
process.exit(0);
