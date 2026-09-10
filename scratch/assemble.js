// scratch/assemble.js
const fs = require('fs');
const path = require('path');

const intro = require('./sections_intro');
const domain1_2 = require('./sections_domain1_2');
const domain3_4 = require('./sections_domain3_4');
const domain5_6 = require('./sections_domain5_6');
const domain7_8 = require('./sections_domain7_8');
const outro = require('./sections_outro');

const fullContent = [
  intro.trim(),
  domain1_2.trim(),
  domain3_4.trim(),
  domain5_6.trim(),
  domain7_8.trim(),
  outro.trim()
].join('\n\n');

console.log('Total character length:', fullContent.length);

// Validate markdown tables
const lines = fullContent.split('\n');
let inTable = false;
let headerCols = 0;
let tableErrors = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('|') && line.endsWith('|')) {
    const cols = line.split('|').length - 2; // trim leading and trailing empty strings from split
    if (!inTable) {
      inTable = true;
      headerCols = cols;
    } else {
      // Check delimiter or row
      if (cols !== headerCols) {
        tableErrors.push(`Line ${i + 1}: Column count mismatch. Expected ${headerCols}, got ${cols}. Line: "${line}"`);
      }
    }
  } else {
    inTable = false;
    headerCols = 0;
  }
}

if (tableErrors.length > 0) {
  console.error('Table validation errors found:');
  tableErrors.forEach(err => console.error(err));
  process.exit(1);
} else {
  console.log('Markdown table validation PASSED: 0 syntax or column mismatch errors!');
}

const backendTarget = path.join(__dirname, '..', 'JOBFIT_LEGAL_DECISION_FRAMEWORK.md');
const frontendTarget = path.join('D:', 'Year2', 'Jobfit', 'jobfit-frontend', 'JOBFIT_LEGAL_DECISION_FRAMEWORK.md');

fs.writeFileSync(backendTarget, fullContent, 'utf8');
console.log('Successfully written to:', backendTarget);

fs.writeFileSync(frontendTarget, fullContent, 'utf8');
console.log('Successfully written to:', frontendTarget);

console.log('Done! Total lines written:', lines.length);
