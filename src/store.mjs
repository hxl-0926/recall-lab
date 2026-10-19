import { DatabaseSync } from 'node:sqlite';
import { schedule } from './scheduler.mjs';

export class Store {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw new Error('Database schema is newer than this application'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, source TEXT NOT NULL,
        line INTEGER NOT NULL, evidence TEXT NOT NULL, due_at INTEGER NOT NULL,
        interval_days REAL NOT NULL DEFAULT 0, ease REAL NOT NULL DEFAULT 2.5,
        repetitions INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE TABLE IF NOT EXISTS reviews (
        event_id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id),
        grade INTEGER NOT NULL CHECK(grade BETWEEN 0 AND 3), reviewed_at INTEGER NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS cards_due ON cards(due_at);
      PRAGMA user_version=1;`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  import(cards, now = Date.now()) {
    return this.transaction(() => {
      let added = 0;
      const insert = this.db.prepare('INSERT OR IGNORE INTO cards(id,question,answer,source,line,evidence,due_at) VALUES(?,?,?,?,?,?,?)');
      for (const c of cards) added += Number(insert.run(c.id, c.question, c.answer, c.source, c.line, c.evidence, now).changes);
      return added;
    });
  }
  due(now = Date.now(), limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid due limit');
    return this.db.prepare('SELECT * FROM cards WHERE due_at<=? ORDER BY due_at,id LIMIT ?').all(now, limit);
  }
  review(id, grade, { eventId, expectedVersion, now = Date.now() }) {
    if (typeof eventId !== 'string' || !eventId.trim()) throw new Error('eventId is required');
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM reviews WHERE event_id=?').get(eventId);
      if (previous) {
        if (previous.card_id !== id || previous.grade !== grade) throw new Error('Idempotency key reused for a different review');
        return { ...JSON.parse(previous.after_json), replayed: true };
      }
      const card = this.db.prepare('SELECT * FROM cards WHERE id=?').get(id);
      if (!card) throw new Error('Unknown card');
      if (card.version !== expectedVersion) throw new Error('Stale card version; reload due cards');
      const next = { ...card, ...schedule(card, grade, now), version: card.version + 1 };
      this.db.prepare('UPDATE cards SET due_at=?,interval_days=?,ease=?,repetitions=?,lapses=?,version=? WHERE id=?').run(next.due_at, next.interval_days, next.ease, next.repetitions, next.lapses, next.version, id);
      this.db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?)').run(eventId, id, grade, now, JSON.stringify(card), JSON.stringify(next));
      return next;
    });
  }
  stats(now = Date.now()) {
    return { ...this.db.prepare('SELECT count(*) AS total, coalesce(sum(due_at<=?),0) AS due FROM cards').get(now), reviews: this.db.prepare('SELECT count(*) AS n FROM reviews').get().n };
  }
  export() { return { version: 1, cards: this.db.prepare('SELECT * FROM cards ORDER BY id').all(), reviews: this.db.prepare('SELECT * FROM reviews ORDER BY reviewed_at,event_id').all() }; }
  close() { this.db.close(); }
}
