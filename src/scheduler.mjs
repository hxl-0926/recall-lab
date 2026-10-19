const DAY = 86_400_000;

// A deliberately small, transparent SM-2-inspired scheduler; not FSRS.
export function schedule(card, grade, now) {
  if (!Number.isInteger(grade) || grade < 0 || grade > 3) throw new Error('Grade must be 0=again, 1=hard, 2=good, 3=easy');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid review time');
  let { interval_days: interval, ease, repetitions, lapses } = card;
  if (grade === 0) {
    return { interval_days: 0, ease: Math.max(1.3, ease - 0.2), repetitions: 0, lapses: lapses + 1, due_at: now + 600_000 };
  }
  if (grade === 1) { interval = Math.max(1, interval * 1.2); ease = Math.max(1.3, ease - 0.15); }
  if (grade === 2) interval = repetitions === 0 ? 1 : repetitions === 1 ? 3 : interval * ease;
  if (grade === 3) { interval = Math.max(4, interval * ease * 1.3); ease += 0.15; }
  interval = Math.min(3650, Math.round(interval * 100) / 100);
  return { interval_days: interval, ease, repetitions: repetitions + 1, lapses, due_at: now + Math.round(interval * DAY) };
}
