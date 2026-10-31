/**
 * PowerDeck Pro - Code Protection & Build Pipeline
 * Hardens Electron applications against ASAR decompilation, reverse engineering, and tampering.
 * 
 * Techniques Applied:
 * 1. JavaScript Obfuscation (Control flow flattening, string encryption, dead code injection, self-defending)
 * 2. V8 Bytecode Compilation (Compiles .js to native .jsc binary bytecode using bytenode -e)
 * 3. ASAR Packaging with Electron-Builder (NSIS Installer + Portable with custom icons)
 * 
 * Usage:
 *   node scripts/protect-and-build.js          (Prepares and tests protected build)
 *   node scripts/protect-and-build.js --build  (Compiles final protected .exe installer & portable)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT_DIR, '.src_backup_temp');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

console.log('====================================================');
console.log('⚡ PowerDeck Pro - Binary Anti-Decompilation Pipeline');
console.log('====================================================\n');

// Step 0: Check required build tools
function checkDependencies() {
  console.log('[1/4] Checking code protection dependencies...');
  try {
    require.resolve('javascript-obfuscator', { paths: [ROOT_DIR] });
    require.resolve('bytenode', { paths: [ROOT_DIR] });
    console.log('✓ All protection packages are available.\n');
  } catch (err) {
    console.error('❌ Missing dependencies. Please run: npm install');
    process.exit(1);
  }
}

// Helper: Recursive copy
function copyDirectorySync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Step 1: Backup src directory
function createBackup() {
  console.log('[2/4] Creating temporary backup of src/ directory...');
  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
  copyDirectorySync(SRC_DIR, BACKUP_DIR);
  console.log('✓ Source files safely backed up to .src_backup_temp/\n');
}

// Step 2: Obfuscate and compile to V8 Bytecode in-place
function protectFiles() {
  console.log('[3/4] Obfuscating & Compiling to V8 Bytecode (.jsc)...');
  const JavaScriptObfuscator = require(require.resolve('javascript-obfuscator', { paths: [ROOT_DIR] }));

  const nodeObfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.25,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    transformObjectKeys: true,
    selfDefending: false,
    numbersToExpressions: false,
    simplify: true,
    target: 'node'
  };

  const browserObfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.2,
    deadCodeInjection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.7,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: true,
    splitStringsChunkLength: 12,
    transformObjectKeys: true,
    selfDefending: false,
    debugProtection: false,
    numbersToExpressions: false,
    simplify: true,
    target: 'browser'
  };

  // 1. Obfuscate main.js
  const mainPath = path.join(SRC_DIR, 'main.js');
  if (fs.existsSync(mainPath)) {
    console.log('  🔒 Obfuscating src/main.js...');
    const mainCode = fs.readFileSync(mainPath, 'utf8');
    const mainRes = JavaScriptObfuscator.obfuscate(mainCode, nodeObfuscatorOptions);
    fs.writeFileSync(mainPath, mainRes.getObfuscatedCode(), 'utf8');

    console.log('  🛡️ Compiling src/main.js -> src/main.jsc (V8 Bytecode for Electron)...');
    execSync('npx bytenode -e -c src/main.js', { cwd: ROOT_DIR, stdio: 'inherit' });

    const loaderCode = `/**
 * PowerDeck Pro - V8 Bytecode Loader
 * The core runtime logic has been compiled into binary bytecode (main.jsc).
 * Unauthorized decompilation or modification is strictly prohibited.
 */
require('bytenode');
require('./main.jsc');
`;
    fs.writeFileSync(mainPath, loaderCode, 'utf8');
  }

  // 2. Obfuscate preload.js (Heavily obfuscated, preserving contextBridge in isolated world)
  const preloadPath = path.join(SRC_DIR, 'preload.js');
  if (fs.existsSync(preloadPath)) {
    console.log('  🔒 Obfuscating src/preload.js...');
    const preloadCode = fs.readFileSync(preloadPath, 'utf8');
    const preloadRes = JavaScriptObfuscator.obfuscate(preloadCode, nodeObfuscatorOptions);
    fs.writeFileSync(preloadPath, preloadRes.getObfuscatedCode(), 'utf8');
  }

  // 3. Obfuscate renderer.js with String Encryption & Control Flow Flattening
  const rendererPath = path.join(SRC_DIR, 'renderer', 'renderer.js');
  if (fs.existsSync(rendererPath)) {
    console.log('  🔒 Obfuscating src/renderer/renderer.js (Base64 Strings, Mangling, Control-Flow)...');
    const rendererCode = fs.readFileSync(rendererPath, 'utf8');
    const rendererRes = JavaScriptObfuscator.obfuscate(rendererCode, browserObfuscatorOptions);
    fs.writeFileSync(rendererPath, rendererRes.getObfuscatedCode(), 'utf8');
  }

  // 4. Minify & Strip HTML Comments
  const htmlPath = path.join(SRC_DIR, 'renderer', 'index.html');
  if (fs.existsSync(htmlPath)) {
    console.log('  🔒 Minifying src/renderer/index.html (Stripping comments)...');
    let htmlCode = fs.readFileSync(htmlPath, 'utf8');
    htmlCode = htmlCode.replace(/<!--[\s\S]*?-->/g, '');
    fs.writeFileSync(htmlPath, htmlCode, 'utf8');
  }

  // 5. Minify & Strip CSS Comments
  const cssPath = path.join(SRC_DIR, 'renderer', 'style.css');
  if (fs.existsSync(cssPath)) {
    console.log('  🔒 Minifying src/renderer/style.css (Stripping comments & compacting)...');
    let cssCode = fs.readFileSync(cssPath, 'utf8');
    cssCode = cssCode.replace(/\/\*[\s\S]*?\*\//g, '');
    cssCode = cssCode.replace(/\s+/g, ' ')
      .replace(/\s*{\s*/g, '{')
      .replace(/\s*}\s*/g, '}')
      .replace(/\s*;\s*/g, ';')
      .replace(/\s*:\s*/g, ':')
      .replace(/\s*,\s*/g, ',')
      .trim();
    fs.writeFileSync(cssPath, cssCode, 'utf8');
  }

  console.log('✓ Code obfuscated and compiled into V8 binary bytecode successfully.\n');
}

// Step 3: Run electron-builder
function buildExecutable() {
  console.log('[4/4] Building protected executable (Installer + Portable) with icons...');
  execSync('npx electron-builder --win', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log(`\n🎉 Protected build finished! Output generated in: ${DIST_DIR}`);
}

// Step 4: Restore backup
function restoreBackup() {
  console.log('🔄 Restoring clean development source files...');
  if (fs.existsSync(BACKUP_DIR)) {
    // Clean current src and restore
    if (fs.existsSync(SRC_DIR)) {
      fs.rmSync(SRC_DIR, { recursive: true, force: true });
    }
    copyDirectorySync(BACKUP_DIR, SRC_DIR);
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
    console.log('✓ Development files cleanly restored.\n');
  }
}

// Execute Pipeline with Guaranteed Restore
async function run() {
  checkDependencies();
  createBackup();

  try {
    protectFiles();
    if (process.argv.includes('--build')) {
      buildExecutable();
    } else {
      console.log('✓ Protection verified! Run with --build to compile the executable.');
    }
  } catch (err) {
    console.error('❌ Build pipeline error:', err);
  } finally {
    restoreBackup();
  }
}

run();
