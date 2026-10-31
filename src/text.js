// Every player-facing string, in one place.
import { isPdc } from './sim/ship.js';

const num = (v) => String(Math.round(v * 10) / 10); // plain: no decimals unless needed

export const T = {
  title: 'ROCINANTE',
  ships: { me: 'Rocinante', them: 'Pella' },
  numbers: { range: 'RANGE', torps: 'TORPS', burns: 'BURNS', clock: 'CLOCK' },
  phase: { approach: 'APPROACH', knife: 'KNIFE FIGHT', break: 'BREAK' },
  buttons: {
    hold: 'HOLD',
    guard: 'GUARD', rake: 'RAKE',
    torps: 'TORPS', rail: 'RAIL', burn: 'BURN', run: 'RUN',
  },
  hints: {
    hold: 'cut thrust',
    guard: 'vs torpedoes', rake: 'rake hull',
    torps: 'fire four', rail: 'aim 3 s', burn: 'dodge rail', run: 'leave fight',
  },
  legend: {
    drag: 'DRAG on the map from your ship: the nose swings to the arrow and the ship flies that way at the speed you asked, and keeps it. Longer drag, faster. The autopilot never rams.',
    bow: 'Nose within 45 degrees of them. Railgun can aim. They hit your rail first, then sensors, then the PDC mounts.',
    side: 'Hull across the line to them. The PDCs on the side facing them fire. Every room is exposed, hits land anywhere.',
    tail: 'Stern toward them. No tubes, no rail. They hit your drive first.',
    hold: 'Cut the thrust and keep the speed you have. Drag a short arrow to stop.',
    guard: 'PDCs shoot incoming torpedoes first. Safer, slower.',
    rake: 'PDCs chew their hull piece by piece. Torpedoes get through.',
    torps: 'Four torpedoes, three salvos. Each kills the room it reaches and wounds the next. Their PDCs on Guard shoot some down; four at once swamp them.',
    rail: 'Bow only. Three seconds of steady aim, then one shot kills a room and wounds the next. You cannot Burn while aiming.',
    burn: 'The drive at full for an instant, the way the nose points: bow-on it closes, stern-on it opens, broadside it sidesteps. Any Burn while their railgun is aiming makes it miss. Three per battle.',
    run: 'Dump everything into the drive and leave. Ends the battle as an escape.',
    armor: 'Plated rooms (thick bright edge: bridge, tubes) take two torpedoes. Bulkheads (thick seams) stop damage spilling into the next room.',
    tear: 'A dead room is a hole. Rooms cut off from the bridge by it tear off and drift away. A dead PDC mount is one gun fewer, nothing tears. The bridge sits in the middle: crew dead loses the stern (tubes, their torpedoes, drive).',
    tap: 'TAP a room on their ship to go for it: torpedoes swing wide to reach a room that is not exposed (longer inside their PDCs), PDCs chew it only when they are broadside. Tap it again to clear. Tap a room on your ship to see what it does.',
  },
  pause: 'PAUSE', resume: 'RESUME', restart: 'RESTART', newBattle: 'NEW BATTLE',
  pausedTitle: 'PAUSED. GIVE ORDERS, THEN RESUME.',
  paused: 'PAUSED. Give orders, then resume.',
  rotate: 'ROTATE YOUR PHONE TO LANDSCAPE',
  export: 'EXPORT', import: 'IMPORT', copied: 'Copied.', copyFailed: 'Could not copy. Select the text and copy it yourself.',
  exportTitle: 'REPLAY JSON. Copy it and paste it in chat.', copy: 'COPY', download: 'DOWNLOAD', close: 'CLOSE',
  importPrompt: 'Paste a replay JSON:', importBad: 'That is not a replay.',
  auto: 'AUTO', autoOff: 'MANUAL', autoLine: 'AUTO. The ship flies itself.',
  replaying: 'REPLAY', replayLine: 'REPLAY. Watching a recorded battle.',
  enemyLabel: 'enemy',
  stats: {
    title: 'STATS', torps: 'Torpedoes fired / shot down / missed / landed', rail: 'Railgun fired / landed / dodged',
    burns: 'Burns', pieces: 'Rooms lost',
  },
  order: {
    hold: 'Coasting', flying: 'flying', stopping: 'stopping',
    bow: 'Bow on', side: 'Broadside', tail: 'Stern on', turning: 'Swinging',
    guard: 'PDC on guard', rake: 'PDC raking hull',
    run: 'RUNNING',
    aiming: 'Railgun aiming, hold steady',
    torpsAway: 'Torpedoes away',
    burn: 'Burning',
    target: 'Going for their', targetCleared: 'Target cleared. The exposed end.',
  },
  refusal: {
    noDrive: 'Drive is gone. We drift.',
    running: 'We are already running.',
    noPdc: 'All the PDCs are gone.',
    noTubes: 'Tubes are gone.',
    noTorps: 'No torpedoes left.',
    reloading: 'Tubes reloading.',
    tooFar: 'Out of range.',
    noRail: 'Railgun is gone.',
    charging: 'Railgun charging.',
    aiming: 'Already aiming.',
    noBurns: 'No burns left.',
    aimingNoBurn: 'Cannot burn while aiming. Wait for the shot.',
    alreadyPdc: 'Already doing that.', alreadyHolding: 'Already coasting.', badMove: 'Bad move order.',
    tailNoTubes: 'Tubes face away from them. Turn first.', noSensors: 'Sensors are gone. No firing solution.',
    railNeedsBow: 'Railgun needs the bow on them.',
    over: 'The battle is over.',
    badTarget: 'No such room.', roomDead: 'That room is already gone.', sameTarget: 'Already going for it.', noTarget: 'No room targeted.',
  },
  warn: { railAimingAtUs: 'ENEMY RAILGUN AIMING. BURN?' , torpsIncoming: 'TORPEDOES INCOMING' },
  pieces: { rail: 'Railgun', sensors: 'Sensors', bridge: 'Bridge', pdc: 'PDC mount', crew: 'Crew', tubes: 'Tubes', drive: 'Drive', frame: 'Frame' },
  // One line when a room dies: whose, which, and what it costs them from now on.
  roomDead: {
    rail: 'no railgun', sensors: 'rail blind, torpedoes and PDCs hit half as often', bridge: 'beaten',
    pdc: 'one gun fewer', crew: 'reload and recharge at half speed', tubes: 'no torpedoes', drive: 'adrift, no turning, no Burn',
  },
  // One line when a section tears off: whose, which end, what went with it.
  tear: { bow: 'BOW TORE OFF', stern: 'STERN TORE OFF' }, adrift: 'adrift', frameAdrift: 'frame adrift',
  lost: { me: 'OUR', them: 'THEIR' }, gone: 'GONE',
  roomInfo: {
    rail: 'One shot kills a room. Bow only. Dead: no railgun.',
    sensors: 'Firing solutions. Dead: no rail aim, weapons hit half as often.',
    bridge: 'Takes two hits. Every room must reach it, or it tears off. Dead: the ship is beaten.',
    pdc: 'One PDC. Fires at what is on its side, or ahead and astern. Dead: one gun fewer.',
    crew: 'Damage control. Dead: reload and recharge at half speed, and the stern tears off.',
    tubes: 'Torpedoes, four a salvo. Dead: no torpedoes, and the drive tears off.',
    drive: 'Dead: no moving, no turning, no Burn.',
  },
  result: {
    win: { bridge: 'PELLA IS DEAD. Her bridge is gone.', disarmed: 'PELLA IS BEATEN. Nothing left to shoot with.', hull: 'PELLA IS FINISHED. Half her hull is adrift.' },
    lose: { bridge: 'ROCINANTE IS DEAD. The bridge is gone.', disarmed: 'ROCINANTE IS BEATEN. Nothing left to shoot with.', hull: 'ROCINANTE IS FINISHED. Half the hull is adrift.' },
    escaped: { me: 'WE GOT AWAY. Live to fight dirty another day.', them: 'PELLA RAN. She will be back.' },
    draw: { both: 'BOTH SHIPS DEAD IN THE BLACK.', apart: 'BOTH SHIPS BROKE OFF.', time: 'STALEMATE. Both ships drift apart.' },
  },
  again: 'NEW BATTLE', same: 'SAME SEED', seed: 'seed',
  // The hangar: one of two for each slot that has a choice. Names and one line each.
  hangar: { button: 'HANGAR', title: 'HANGAR. Fit the Rocinante, pick the enemy, then launch.', enemy: 'ENEMY', launch: 'LAUNCH', close: 'CLOSE', hint: 'Tap a marked part to swap it.' },
  slots: { launcher: 'Tubes', gun: 'Railgun', drive: 'Drive' },
  catalog: {
    quad: { name: 'Quad tubes', line: 'Four at once swamp a Guard.' },
    twin: { name: 'Twin tubes', line: 'A Guard kills a bigger share; a wasted salvo costs two.' },
    longRail: { name: 'Long rail', line: 'Shoots from outside their torpedo range.' },
    quickRail: { name: 'Quick rail', line: 'Two shots in the time of one, but only inside their torpedo range.' },
    corvette: { name: 'Corvette drive', line: 'The stock drive.' },
    hot: { name: 'Hot drive', line: 'Twice the push, so the range is yours; one Burn fewer to dodge with.' },
  },
  // The enemy pick in the hangar: one per AI preset (ai/presets.js), a name and how it fights.
  enemies: {
    brawler: { name: 'Brawler', line: 'Closes, rakes, fires everything, gambles on the rail. The default.' },
    sniper: { name: 'Sniper', line: 'Stays out, guards, lets the rail do the work; goes for your drive.' },
    turtle: { name: 'Turtle', line: 'Closes broadside behind its PDCs; torpedoes only once your PDCs are gone.' },
    gunship: { name: 'Belter gunship', line: 'No rail, no plating, sixteen torpedoes; closes broadside. Not too hard.' },
    berserker: { name: 'Berserker', line: 'Never runs, never dodges, fires the rail the moment it can.' },
  },
  // A preset's knobs as plain stats for the enemy list.
  enemyStats: (p) => `${p.ship === 'belter' ? 'Belter' : 'Tachi'}, ${p.range === 'open' ? 'keeps range' : 'closes'}, torpedoes ${p.torps === 'always' ? 'always' : p.torps === 'guardDown' ? 'after your PDCs' : 'never'}, ${p.runAt > 0 ? 'runs when beaten' : 'never runs'}`,
  // A variant's numbers, from its catalog entry, for the hangar's list.
  variantStats: {
    launcher: (v) => `salvo ${num(v.salvo)}, every ${num(v.reload)} s, stock ${num(v.torps)}`,
    gun: (v) => `range ${num(v.range)} km, recharge ${num(v.recharge)} s`,
    drive: (v) => `push x${num(v.accel)}, ${num(v.burns)} Burns`,
  },
};

// The text key of a room: every PDC mount (pdc3) reads as 'pdc'; anything else as itself, and an
// unnamed frame room as 'frame'. Use for T.pieces, T.roomDead and T.roomInfo.
export const roomKey = (id) => (isPdc(id) ? 'pdc' : T.pieces[id] ? id : 'frame');
