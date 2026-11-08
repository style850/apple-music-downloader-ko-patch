'use strict';

// Creates only the small, version-locked files embedded by amdl-korean-patch.
// It never copies the installed native runtime, user profile, or launcher EXE.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const INSTALL_ROOT = path.join(process.env.LOCALAPPDATA || fail('localappdata_missing'), 'Programs', 'Apple Music Downloader Native');
const OUTPUT = path.join(ROOT, 'apple-music-downloader', 'cmd', 'amdl-korean-patch', 'payload');
const PATCH_ID = 'amdl-1.0.3-beta.4-ko-security-2';
const VERSION = '1.0.3-beta.4';
const LAUNCHER_NAME = 'Apple Music Downloader Native.exe';
const EXPECTED_LAUNCHER_SHA256 = '4a3c00aa2bf283cf54a8832e60e9f374d7b6d9028173949c9b09c2686635db33';
const EXPECTED_APP_ASAR_SHA256 = 'fed84703e3a15f47005b2b5bf6119f67c01546328f54ab675bc1283d05dc51e9';
const EXPECTED_RECEIPT_SHA256 = '5655cd8e249f3512e260900e7f45eacde48da1b585461a6bf85d00a775c54818';
const PREVIOUS_HASHES = {
  'resources/app.asar': '438d7448b6d81dcec8d531bbaa6318961ca8a51b644586d4561ae2d4bf87b07f',
  'resources/bin/amdl-service.exe': 'f20c959f57af96f2c138c72ec0a605d75705f219c815ba3656511e4f15d387be',
  'resources/native-package.json': '2085e47d712a6c9c0ca55be419fadd5e7f6a01437537fe5f18ca93a958d982fa',
  'Apple Music Downloader Native.exe': '76eae27a04dafb8da4df0469cfbe63e245c24ad4d4f0d38d5175c1265d4a1580',
};
const INTEGRITY_RESOURCE_OFFSET = 0xECF9418;
const INTEGRITY_RESOURCE_SIZE = 251;
const GENERATED = new Set(['app.asar', 'amdl-service.exe.gz', 'native-package.json', 'manifest.json', 'LICENSE', 'NOTICE']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function sha256File(file) {
  return sha256(fs.readFileSync(file));
}
function fail(message) {
  throw new Error(message);
}
function parseArgs(argv) {
  const options = { installedRoot: INSTALL_ROOT, output: OUTPUT, service: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--installed-root') options.installedRoot = path.resolve(argv[++i] || fail('missing_installed_root'));
    else if (arg === '--output') options.output = path.resolve(argv[++i] || fail('missing_output'));
    else if (arg === '--service') options.service = path.resolve(argv[++i] || fail('missing_service'));
    else fail(`unknown_argument:${arg}`);
  }
  return options;
}
function requireFile(file, error) {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) fail(error);
}
function readJson(file, error) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail(error); }
}
function writeGenerated(output, name, data) {
  if (!GENERATED.has(name)) fail('generated_name_rejected');
  fs.writeFileSync(path.join(output, name), data, { flag: 'w' });
}
function ensureOutput(output) {
  fs.mkdirSync(output, { recursive: true });
  for (const name of GENERATED) {
    const file = path.join(output, name);
    if (fs.existsSync(file)) {
      if (!fs.lstatSync(file).isFile()) fail('generated_target_not_file');
      fs.unlinkSync(file);
    }
  }
}
function verifyReceipt(installRoot, receipt, originalRoot = installRoot) {
  if (receipt.schemaVersion !== 1 || receipt.version !== VERSION || !receipt.files || !receipt.ui) fail('native_receipt_invalid');
  const entries = Object.entries(receipt.files);
  if (entries.length !== 199) fail('native_receipt_file_count_invalid');
  for (const [relative, identity] of entries) {
    if (path.posix.normalize(relative) !== relative || relative.startsWith('../') || path.isAbsolute(relative) || relative.includes('\\')) fail('native_receipt_path_invalid');
    if (!identity || !/^[a-f0-9]{64}$/.test(identity.sha256) || !Number.isSafeInteger(identity.size) || identity.size < 0) fail('native_receipt_identity_invalid');
    const target = path.join(relative === 'bin/amdl-service.exe' ? originalRoot : installRoot, 'resources', relative);
    requireFile(target, 'native_receipt_target_missing');
    if (fs.statSync(target).size !== identity.size || sha256File(target) !== identity.sha256) fail('native_receipt_target_mismatch');
  }
}
function originalRoot(installRoot) {
  const asar = path.join(installRoot, 'resources', 'app.asar');
  if (sha256File(asar) === EXPECTED_APP_ASAR_SHA256) return installRoot;
  const backup = path.join(installRoot, '.amdl-ko-security-backup-v1');
  if (sha256File(path.join(backup, 'resources', 'app.asar')) !== EXPECTED_APP_ASAR_SHA256) fail('original_backup_invalid');
  return backup;
}
function verifyArchiveEntries(archiveEntries, uiFiles) {
  const normalized = archiveEntries.map(entry => entry.replace(/\\/g, '/').replace(/^\//, '')).filter(Boolean);
  const actual = normalized.filter(entry => !normalized.some(other => other !== entry && other.startsWith(`${entry}/`))).sort();
  const expected = [...uiFiles, 'package.json'].sort();
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) fail('installed_asar_layout_mismatch');
}
function updateReceipt(receipt, uiFiles, service) {
  const next = JSON.parse(JSON.stringify(receipt));
  for (const relative of uiFiles) next.ui[relative] = sha256File(path.join(ROOT, relative));
  if (service) next.files['bin/amdl-service.exe'] = { sha256: sha256File(service), size: fs.statSync(service).size };
  return next;
}
function integrityEdit(launcher, beforeHeaderHash, afterHeaderHash) {
  const bytes = fs.readFileSync(launcher);
  if (sha256(bytes) !== EXPECTED_LAUNCHER_SHA256) fail('launcher_identity_mismatch');
  const resource = bytes.subarray(INTEGRITY_RESOURCE_OFFSET, INTEGRITY_RESOURCE_OFFSET + INTEGRITY_RESOURCE_SIZE).toString('utf8');
  const expected = `[{\"file\":\"resources\\\\app.asar\",\"alg\":\"SHA256\",\"value\":\"${beforeHeaderHash}\"}`;
  if (!resource.startsWith(expected) || !resource.includes('resources\\\\default_app.asar')) fail('launcher_integrity_resource_mismatch');
  const local = resource.indexOf(beforeHeaderHash);
  if (local < 0 || resource.indexOf(beforeHeaderHash, local + 1) !== -1) fail('launcher_integrity_hash_ambiguous');
  const offset = INTEGRITY_RESOURCE_OFFSET + local;
  const patched = Buffer.from(bytes);
  patched.write(afterHeaderHash, offset, 'ascii');
  return {
    offset,
    beforeHex: Buffer.from(beforeHeaderHash, 'ascii').toString('hex'),
    afterHex: Buffer.from(afterHeaderHash, 'ascii').toString('hex'),
    afterSHA256: sha256(patched),
  };
}
async function createAsar(asar, installedAsar, outputAsar, uiFiles) {
  verifyArchiveEntries(asar.listPackage(installedAsar), uiFiles);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'amdl-korean-patch-'));
  try {
    asar.extractAll(installedAsar, temporary);
    for (const relative of [...uiFiles, 'package.json']) {
      const source = path.join(ROOT, relative);
      requireFile(source, 'source_file_missing');
      const destination = path.join(temporary, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
    }
    await asar.createPackageWithOptions(temporary, outputAsar, { integrity: true });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 2 });
  }
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePackage = readJson(path.join(ROOT, 'package.json'), 'source_package_invalid');
  if (sourcePackage.version !== VERSION || sourcePackage.main !== 'src/main/native-main.js') fail('source_version_mismatch');
  const nativePackage = require(path.join(ROOT, 'electron', 'native-package.js'));
  const uiFiles = nativePackage.UI_FILES;
  const baseline = originalRoot(options.installedRoot);
  const installedAsar = path.join(baseline, 'resources', 'app.asar');
  const installedReceipt = path.join(baseline, 'resources', 'native-package.json');
  const launcher = path.join(baseline, LAUNCHER_NAME);
  requireFile(installedAsar, 'installed_asar_missing');
  requireFile(installedReceipt, 'installed_receipt_missing');
  requireFile(launcher, 'installed_launcher_missing');
  if (sha256File(installedAsar) !== EXPECTED_APP_ASAR_SHA256 || sha256File(installedReceipt) !== EXPECTED_RECEIPT_SHA256) fail('installed_package_identity_mismatch');
  const receipt = readJson(installedReceipt, 'installed_receipt_invalid');
  verifyReceipt(options.installedRoot, receipt, baseline);
  if (options.service) requireFile(options.service, 'service_payload_missing');
  ensureOutput(options.output);
  for (const name of ['LICENSE', 'NOTICE']) writeGenerated(options.output, name, fs.readFileSync(path.join(ROOT, name)));
  const asar = await import(pathToFileURL(require.resolve('@electron/asar')).href);
  const payloadAsar = path.join(options.output, 'app.asar');
  await createAsar(asar, installedAsar, payloadAsar, uiFiles);
  const beforeHeaderHash = sha256(asar.getRawHeader(installedAsar).headerString);
  const afterHeaderHash = sha256(asar.getRawHeader(payloadAsar).headerString);
  const receiptPayload = updateReceipt(receipt, uiFiles, options.service);
  writeGenerated(options.output, 'native-package.json', JSON.stringify(receiptPayload, null, 2) + '\n');
  const files = [
    { path: 'resources/app.asar', beforeSHA256: sha256File(installedAsar), afterSHA256: sha256File(payloadAsar), payload: 'app.asar' },
    { path: 'resources/native-package.json', beforeSHA256: sha256File(installedReceipt), afterSHA256: sha256File(path.join(options.output, 'native-package.json')), payload: 'native-package.json' },
  ];
  if (options.service) {
    const servicePayload = zlib.gzipSync(fs.readFileSync(options.service), { level: 9, mtime: 0 });
    writeGenerated(options.output, 'amdl-service.exe.gz', servicePayload);
    files.splice(1, 0, { path: 'resources/bin/amdl-service.exe', beforeSHA256: receipt.files['bin/amdl-service.exe'].sha256, afterSHA256: sha256File(options.service), payload: 'amdl-service.exe.gz', compression: 'gzip' });
  }
  const edit = integrityEdit(launcher, beforeHeaderHash, afterHeaderHash);
  files.push({ path: LAUNCHER_NAME, beforeSHA256: sha256File(launcher), afterSHA256: edit.afterSHA256, edits: [{ offset: edit.offset, beforeHex: edit.beforeHex, afterHex: edit.afterHex }] });
  for (const file of files) file.previousSHA256 = PREVIOUS_HASHES[file.path];
  writeGenerated(options.output, 'manifest.json', JSON.stringify({ schemaVersion: 1, patchId: PATCH_ID, version: VERSION, files }, null, 2) + '\n');
  process.stdout.write(`patch_payload_ready:${options.output}\n`);
}

module.exports = { sha256, sha256File, verifyArchiveEntries, verifyReceipt, integrityEdit, updateReceipt, originalRoot };
if (require.main === module) main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
