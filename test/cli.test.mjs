import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { extractCards } from '../src/cards.mjs';

test('interactive CLI flips, saves one review and quits without reviewing next card', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'recall-cli-'));
  try {
    const file = path.join(directory, 'test.db');
    const setup = new Store(file);
    setup.import(extractCards('Use {{recall}}.\nUse {{spacing}}.', 'test.md'), 0);
    setup.close();
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), 'study', file], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '', stage = 0;
    const timer = setTimeout(() => child.kill(), 8000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { errors += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (stage === 0 && output.includes('按 Enter')) { stage = 1; output = ''; child.stdin.write('\n'); }
      else if (stage === 1 && output.includes('0 重来')) { stage = 2; output = ''; child.stdin.write('2\n'); }
      else if (stage === 2 && output.includes('按 Enter')) { stage = 3; child.stdin.write('q\n'); }
    });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    clearTimeout(timer);
    assert.equal(code, 0, errors);
    assert.equal(stage, 3);
    const verify = new Store(file);
    try { assert.equal(verify.stats().reviews, 1); assert.equal(verify.stats().due, 1); }
    finally { verify.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
