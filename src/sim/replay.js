// Replays: a battle is its seed plus the list of accepted orders.
// exportReplay(battle) gives a small JSON object; makeReplayer feeds the orders back in.
export const REPLAY_VERSION = 1;

export function exportReplay(battle, extra = {}) {
  return {
    version: REPLAY_VERSION,
    seed: battle.seed,
    t: Math.round(battle.t * 100) / 100,
    result: battle.result,
    log: battle.log.map((e) => ({ t: e.t, ship: e.ship, order: e.order })), // full precision: a rounded t lands one step late
    stats: battle.stats.export(),
    ...extra,
  };
}

// Drives both ships from a replay log. Call step(b) before every battle.step().
export function makeReplayer(replay) {
  const log = replay.log.slice().sort((a, b) => a.t - b.t);
  let i = 0;
  return {
    done: () => i >= log.length,
    step(b) {
      while (i < log.length && log[i].t <= b.t + 1e-9) {
        b.order(log[i].ship, log[i].order);
        i++;
      }
    },
  };
}

export function parseReplay(text) {
  const r = JSON.parse(text);
  if (!r || typeof r.seed !== 'number' || !Array.isArray(r.log)) throw new Error('not a replay');
  return r;
}
