const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(root, 'locales');
const baseLanguage = 'en';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, nextPrefix);
  });
}

function listJsonFiles(language) {
  return fs
    .readdirSync(path.join(localesDir, language))
    .filter((file) => file.endsWith('.json'))
    .sort();
}

const languages = fs
  .readdirSync(localesDir)
  .filter((entry) => fs.statSync(path.join(localesDir, entry)).isDirectory())
  .sort();

const baseFiles = listJsonFiles(baseLanguage);
let hasErrors = false;

for (const language of languages) {
  const files = listJsonFiles(language);
  const missingFiles = baseFiles.filter((file) => !files.includes(file));
  const extraFiles = files.filter((file) => !baseFiles.includes(file));

  if (missingFiles.length || extraFiles.length) {
    hasErrors = true;
    console.error(`[${language}] file mismatch`);
    if (missingFiles.length) console.error(`  missing: ${missingFiles.join(', ')}`);
    if (extraFiles.length) console.error(`  extra: ${extraFiles.join(', ')}`);
  }

  for (const file of baseFiles) {
    if (!files.includes(file)) continue;

    const baseKeys = new Set(flattenKeys(readJson(path.join(localesDir, baseLanguage, file))));
    const languageKeys = new Set(flattenKeys(readJson(path.join(localesDir, language, file))));
    const missingKeys = [...baseKeys].filter((key) => !languageKeys.has(key));
    const extraKeys = [...languageKeys].filter((key) => !baseKeys.has(key));

    if (missingKeys.length || extraKeys.length) {
      hasErrors = true;
      console.error(`[${language}/${file}] key mismatch`);
      if (missingKeys.length) console.error(`  missing: ${missingKeys.join(', ')}`);
      if (extraKeys.length) console.error(`  extra: ${extraKeys.join(', ')}`);
    }
  }
}

if (hasErrors) process.exit(1);

console.log(`Locale validation passed for ${languages.length} languages and ${baseFiles.length} namespaces.`);
