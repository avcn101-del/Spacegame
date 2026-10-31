// Battle statistics, fed from sim events through battle.emit(). Pure data.
export function makeStats() {
  const side = () => ({
    torpsFired: 0, torpsShotDown: 0, torpsLanded: 0, torpsMissed: 0, // what this ship fired, and what became of it
    railFired: 0, railLanded: 0, railDodged: 0,
    burns: 0, piecesLost: 0,
  });
  const s = {
    me: side(), them: side(),
    timeline: [],            // {t, ship, piece, cause}
    phaseAt: { approach: 0 }, // game time each phase began
  };
  const other = (id) => (id === 'me' ? 'them' : 'me');
  s.onEvent = (ev, t) => {
    switch (ev.type) {
      case 'torpLaunch': s[ev.by].torpsFired += ev.count; break;
      case 'torpKilled': s[other(ev.by)].torpsShotDown += 1; break;
      case 'torpHit': s[other(ev.ship)].torpsLanded += 1; break;
      case 'torpMiss': s[other(ev.ship)].torpsMissed += 1; break;
      case 'railFire': s[ev.by].railFired += 1; break;
      case 'railHit': s[other(ev.ship)].railLanded += 1; break;
      case 'railMiss': s[other(ev.ship)].railDodged += 1; break;
      case 'burn': s[ev.by].burns += 1; break;
      case 'pieceDead':
        s[ev.ship].piecesLost += 1;
        s.timeline.push({ t: Math.round(t * 10) / 10, ship: ev.ship, piece: ev.piece, cause: ev.cause });
        break;
    }
  };
  s.onPhase = (phase, t) => { if (s.phaseAt[phase] === undefined) s.phaseAt[phase] = Math.round(t * 10) / 10; };
  s.export = () => ({ me: s.me, them: s.them, timeline: s.timeline, phaseAt: s.phaseAt });
  return s;
}
