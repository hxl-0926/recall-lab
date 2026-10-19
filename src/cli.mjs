import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { extractCards, generateCards } from './cards.mjs';
import { Store } from './store.mjs';

const [command, dbFile, ...args] = process.argv.slice(2);
const usage = 'import <db> <notes.md> [--model NAME] | due <db> | study <db> | stats <db> | export <db>';
let store;
try {
  if (!dbFile || !['import', 'due', 'study', 'stats', 'export'].includes(command)) throw new Error(usage);
  store = new Store(dbFile);
  if (command === 'import') {
    if (![1, 3].includes(args.length) || (args.length === 3 && args[1] !== '--model')) throw new Error(usage);
    const markdown = await readFile(args[0], 'utf8'), source = path.relative(process.cwd(), path.resolve(args[0])).split(path.sep).join('/');
    const cards = args[2] ? await generateCards(markdown, source, args[2]) : extractCards(markdown, source);
    console.log(JSON.stringify({ mode: args[2] ? 'generated' : 'cloze', added: store.import(cards), preview: cards }, null, 2));
  } else if (command === 'study') {
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const card of store.due()) {
        console.log(`\n${card.question}`);
        if ((await terminal.question('回忆答案，按 Enter 翻面，q 退出：')).trim() === 'q') break;
        console.log(`答案：${card.answer}\n出处：${card.source}:${card.line}\n${card.evidence}`);
        const value = await terminal.question('0 重来 / 1 困难 / 2 正常 / 3 简单 / q 退出：');
        if (value.trim() === 'q') break;
        if (!/^[0-3]$/.test(value.trim())) { console.log('无效评分，本卡未保存。'); continue; }
        const result = store.review(card.id, Number(value), { eventId: randomUUID(), expectedVersion: card.version });
        console.log(`下次：${new Date(result.due_at).toLocaleString()}`);
      }
    } finally { terminal.close(); }
  } else if (command === 'due') console.log(JSON.stringify(store.due().map(({ answer, evidence, ...question }) => question), null, 2));
  else if (command === 'stats') console.log(JSON.stringify(store.stats(), null, 2));
  else console.log(JSON.stringify(store.export(), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { store?.close(); }
