'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { integrityEdit, sha256, verifyArchiveEntries, originalRoot } = require('../../scripts/prepare-korean-patch');

test('Korean patch preparation accepts only the locked ASAR layout', () => {
  const ui = ['src/renderer/native-index.html', 'src/main/native-main.js'];
  assert.doesNotThrow(() => verifyArchiveEntries(['\\package.json', '\\src', '\\src\\main', '\\src\\main\\native-main.js', '\\src\\renderer', '\\src\\renderer\\native-index.html'], ui));
  assert.throws(() => verifyArchiveEntries(['/package.json', '/unexpected.js'], ui), /installed_asar_layout_mismatch/);
});

test('Korean patch preparation hashes bytes without text conversion', () => {
  assert.equal(sha256(Buffer.from([0, 0xff, 0x41])), 'a90a10503fbfc95789ff38a1bb5039cb71869ab9c0eb1cb51c4a9099f2933c6b');
});

test('launcher edit serializes the 64 ASCII digest bytes as hex', { skip: !process.env.LOCALAPPDATA }, () => {
  const install = path.join(process.env.LOCALAPPDATA, 'Programs', 'Apple Music Downloader Native');
  if (!fs.existsSync(path.join(install, 'resources/app.asar'))) return;
  const launcher = path.join(originalRoot(install), 'Apple Music Downloader Native.exe');
  const before = '67950d24cf4928f6aeb0073a8f2ab8b6e8aa579aa9bddecfc143d1d1c008f413';
  const after = '0'.repeat(64);
  const edit = integrityEdit(launcher, before, after);
  const bytes = fs.readFileSync(launcher);
  assert.equal(Buffer.from(edit.beforeHex, 'hex').compare(bytes.subarray(edit.offset, edit.offset + 64)), 0);
  assert.equal(Buffer.from(edit.afterHex, 'hex').toString('ascii'), after);
});
