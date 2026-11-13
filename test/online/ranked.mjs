// Ranked play and lobby rules on a real match server: the queue pairs two players and starts their match, leaving loses it, a dropped
// connection has a short time to come back, a name is kept by its key, the leaderboard pages, and a custom lobby's start ore and speed.
// Needs a build (npm run build). Run with: node test/online/ranked.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { server, client, checker, sleep } from './lib.mjs';

const { check, done } = checker();
const dir = mkdtempSync(join(tmpdir(), 'ranked-')), RANK_FILE = join(dir, 'ranked.json');
const S = await server(8155, { RANK_FILE, RANK_AWAY_MS: '2500', ORE_TRUST_HITS: '1' });
const within = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(what + ' timed out'); })]);
const queue = async (name, fac, key = '') => { const c = await client(S.url, name); c.send({ t: 'queue', name, fac, key }); return c; };
try {
  // ---------------------------------------------------------------- two players are paired and play
  const A = await queue('Ada', 0), B = await queue('Bree', 2);
  const qa = await A.wait(m => m.t === 'queued' && m.key), qb = await B.wait(m => m.t === 'queued' && m.key);
  check(/^[a-f0-9]{32}$/.test(qa.key) && qa.key !== qb.key && qa.season >= 1, `both are given a key for their name, season ${qa.season}`);
  const mA = await A.wait(m => m.t === 'matched', 5000), bA = await A.wait(m => m.t === 'begin'), bB = await B.wait(m => m.t === 'begin');
  check(mA.foe === 'Bree' && mA.foeRating === 1500, 'Ada is told who she is playing: Bree, 1500');
  // Ironhold (0) against the Gloam (2): match code 2 when Ada holds the yard, 6 when Bree does
  check(bA.team >= 0 && bB.team >= 0 && bA.team !== bB.team && [2, 6].includes(bA.out) && bA.map >= 0 && bA.map <= 2 && bA.diff === 1, `they hold one end each and play their own factions (match code ${bA.out}, map ${bA.map})`);
  // nobody else can take a seat; anyone can watch
  const C = await client(S.url, 'Cass'); C.send({ t: 'join', code: mA.code, name: 'Cass' }); const e = await C.wait(m => m.t === 'err');
  check(/ranked match/.test(e.msg), 'a third player cannot join a ranked match as a player');
  C.send({ t: 'join', code: mA.code, name: 'Cass', watch: 1 }); const w = await C.wait(m => m.t === 'begin' && m.watch);
  check(!!w, 'but can join it to watch');
  A.send({ t: 'set', rules: { ore: 5000 } }); const e2 = await A.wait(m => m.t === 'err');
  check(/queue/.test(e2.msg), 'the players cannot change a ranked match\'s rules');
  await sleep(1500);
  // Bree leaves: Ada wins, both are rated
  B.send({ t: 'leave' });
  const oA = await A.wait(m => m.t === 'over'), oB = await B.wait(m => m.t === 'over'), oC = await C.wait(m => m.t === 'over');
  check(oA.won === true && oA.mine === 1 && oA.rank && oA.rank.before === 1500 && oA.rank.delta > 100 && oA.rank.left === 'Bree', `leaving loses: Ada wins and goes from 1500 to ${oA.rank?.after}`);
  check(oB.won === false && oB.rank && oB.rank.delta === -oA.rank.delta, `Bree loses ${-oB.rank?.delta}`);
  check(!oC.rank && !!oA.replay && oC.replay === oA.replay, 'the watcher sees the end with no rating, and the match is kept as a replay');
  const J = await (await fetch(`${S.http}/leaderboard.json?name=ada`)).json();
  check(J.top.length === 2 && J.top[0].name === 'Ada' && J.top[0].provisional && J.me?.name === 'Ada' && J.me.wins === 1, 'the leaderboard has Ada first, still settling');
  const H = await (await fetch(`${S.http}/leaderboard`)).text();
  check(/<title>Ore Else ranked<\/title>/.test(H) && H.includes('Ada') && H.includes('Bree') && H.indexOf('Ada') < H.indexOf('Bree'), 'the leaderboard page lists them in order');
  check(JSON.parse(readFileSync(RANK_FILE, 'utf8')).players.bree.games === 1, 'the result is in the ranked file');
  // a name is kept by its key
  const I = await queue('ada', 1); const ie = await I.wait(m => m.t === 'err');
  check(/already plays ranked as ada/.test(ie.msg) && !I.got.some(m => m.t === 'queued'), 'somebody else cannot queue as Ada (any capitals) without her key');
  I.close(); A.close(); B.close(); C.close();

  // ---------------------------------------------------------------- a dropped connection
  const A2 = await queue('Ada', 1, qa.key), D = await queue('Dov', 0);
  const qa2 = await A2.wait(m => m.t === 'queued'); check(qa2.me?.rating === oA.rank.after && qa2.key === qa.key, `Ada queues again with her key, at ${qa2.me?.rating}`);
  // 162 points apart: they are paired once both have waited 20 seconds
  const tq = Date.now(); await A2.wait(m => m.t === 'begin', 30000); await D.wait(m => m.t === 'begin');
  check(Date.now() - tq > 15000, `Ada (${qa2.me?.rating}) and a new player are paired only after waiting ${((Date.now() - tq) / 1000).toFixed(0)} s`);
  await sleep(1000); D.close();
  const t0 = Date.now(), o2 = await within(A2.wait(m => m.t === 'over', 9000), 9500, 'drop');
  check(o2.won === true && o2.rank?.left === 'Dov' && Date.now() - t0 > 1500, `Dov dropped and did not come back: Ada wins after ${((Date.now() - t0) / 1000).toFixed(1)} s (${o2.rank?.before} to ${o2.rank?.after}, a smaller gain than before)`);
  check(o2.rank.delta > 0 && o2.rank.delta < oA.rank.delta, 'her second win moves her rating less than the first');
  A2.close();

  // ---------------------------------------------------------------- coming back in time
  const E = await queue('Eli', 0), F = await queue('Fen', 1), qf = await F.wait(m => m.t === 'queued' && m.key);
  const bE = await E.wait(m => m.t === 'begin', 8000), bF = await F.wait(m => m.t === 'begin');
  await sleep(800); F.close(); await sleep(700);
  const F2 = await queue('Fen', 1, qf.key), back = await F2.wait(m => m.t === 'begin', 4000);
  check(back.team === bF.team && !F2.got.some(m => m.t === 'queued'), 'Fen drops and queues again in time: straight back into the same match, on the same side');
  await sleep(3500);
  check(!E.got.some(m => m.t === 'over') && !F2.got.some(m => m.t === 'over'), 'and the match goes on: nobody has lost');
  F2.send({ t: 'leave' }); const oE = await E.wait(m => m.t === 'over'); check(oE.won === true && oE.rank?.left === 'Fen', 'until Fen leaves for good');
  void bE; E.close(); F2.close();

  // ---------------------------------------------------------------- stop looking
  const G = await queue('Gus', 0); await G.wait(m => m.t === 'queued' && m.key); G.send({ t: 'unqueue' }); const off = await G.wait(m => m.t === 'queued' && m.off);
  const K = await queue('Kai', 0); await sleep(2500);
  check(!!off && !K.got.some(m => m.t === 'matched'), 'a player who stops looking is not paired');
  G.close(); K.close();

  // ---------------------------------------------------------------- lobby rules in a custom game
  const P = await client(S.url, 'Pia'), Q = await client(S.url, 'Quin');
  P.send({ t: 'create', name: 'Pia' }); const lc = (await P.wait(m => m.t === 'lobby' && m.code)).code;
  P.send({ t: 'set', rules: { ore: 600, flux: 80, speed: 2 } }); const lr = await P.wait(m => m.t === 'lobby' && m.rules);
  check(lr.rules.ore === 600 && lr.rules.flux === 80 && lr.rules.speed === 2, 'the host sets start ore 600, Flux 80 and double speed, and the lobby shows it');
  Q.send({ t: 'join', code: lc, name: 'Quin' }); await Q.wait(m => m.t === 'lobby' && m.code === lc);
  Q.send({ t: 'set', rules: { ore: 0 } }); await sleep(300); check(P.last('lobby').rules.ore === 600, 'only the host sets the rules');
  P.send({ t: 'set', rules: { ore: 99999, speed: 7 } }); await sleep(300); check(P.last('lobby').rules.ore === 600 && P.last('lobby').rules.speed === 2, 'rules out of range are ignored');
  Q.send({ t: 'team', v: 1 }); Q.send({ t: 'ready', v: true }); await P.wait(m => m.t === 'lobby' && m.players.every(p => p.ready || p.id === m.host));
  P.send({ t: 'start' }); const pb = await P.wait(m => m.t === 'begin');
  check(pb.speed === 2, 'the players are told the match runs at double speed');
  const s0 = await P.wait(m => m.t === 's'); check(s0.ore > 300, `and start rich: ${s0.ore} ore in the first picture, after the crew's first spending (the usual start is 100)`);
  const t1 = Date.now(), g1 = P.last('s').time; await sleep(2000); const g2 = P.last('s').time, rate = (g2 - g1) / ((Date.now() - t1) / 1000);
  check(rate > 1.7 && rate < 2.3, `the match clock runs ${rate.toFixed(2)} times as fast as the wall clock`);
  P.close(); Q.close();
} catch (err) { check(false, 'the test ran to the end: ' + err.message); console.log(S.log().slice(-1500)); }
S.stop(); done('ranked');
