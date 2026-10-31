// Replays: a battle is its seed plus the list of accepted orders.
// exportReplay(battle) gives a small JSON object; makeReplayer feeds the orders back in.
export const REPLAY_VERSION = 7; // 4: target orders with {room}; 5: move orders with {heading, speed}; 6: ships {me, them} design ids; 7: ships {me, them} are {design, fit}

export function exportReplay(battle, extra = {}) {
  return {
    version: REPLAY_VERSION,
    seed: battle.seed,
    ships: battle.designs,
    t: Math.round(battle.t * 100) / 100,
    result: battle.result,
    log: battle.log.map((e) => (e.arg === undefined ? { t: e.t, ship: e.ship, order: e.order } : { t: e.t, ship: e.ship, order: e.order, arg: e.arg })), // full precision t: a rounded t lands one step late
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
        b.order(log[i].ship, log[i].order, log[i].arg);
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
