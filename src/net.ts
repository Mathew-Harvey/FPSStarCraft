// The browser's side of a multiplayer match: one WebSocket to the match server.
import type { TeamPlan } from './core/sides';
export interface LobbyPlayer { id: number; name: string; ready: boolean; team: number }
export interface Lobby { code: string; you: number; host: number; map: number; /** A made map's code, or '' (see mapcode.ts). */ plan?: string; diff: number; out?: number; /** A team game or free-for-all, if the host set one. */ mt?: TeamPlan | null; players: LobbyPlayer[]; state: 'lobby' | 'play' }

export class Net {
  ws: WebSocket | null = null; id = 0; unit = 0; lobby: Lobby | null = null; open = false;
  /** Snapshots and other in-match messages wait here until the game loop is ready for them. */
  inbox: any[] = []; out: any[][] = []; sendT = 0; lastSnap = 0;
  /** Set when this connection watches instead of playing: whose body the view follows (see follow in src/netgame.ts). */
  watch: { follow: number; team: number } | null = null;
  /** The name the server kept the last match under, as a replay ('' when it was too short to keep). */
  replay = '';
  onLobby: (l: Lobby) => void = () => { /* set by the menu */ };
  onBegin: (m: { out?: number; plan?: string; map: number; diff: number; unit: number; names: Record<number, string>; ph?: number[][]; team?: number; teams?: Record<number, number>; eco?: number; /** A team game or free-for-all (see TeamPlan in src/core/sides.ts). */ mt?: TeamPlan | null }) => void = () => { /* set by the menu */ };
  onError: (msg: string) => void = () => { /* set by the menu */ };
  onClose: () => void = () => { /* set by the menu */ };

  connect(url: string) {
    return new Promise<void>((res, rej) => {
      let done = false; const fail = (m: string) => { if (!done) { done = true; rej(new Error(m)); } };
      try { this.ws = new WebSocket(url); } catch (e) { fail('That server address did not work.'); return; }
      const ws = this.ws; setTimeout(() => fail('No answer from the server.'), 7000);
      ws.onopen = () => { this.open = true; done = true; res(); };
      ws.onerror = () => fail('Could not reach the server.');
      ws.onclose = () => { const was = this.open; this.open = false; if (was) this.onClose(); };
      ws.onmessage = e => {
        let m: any; try { m = JSON.parse(String(e.data)); } catch (x) { return; }
        if (m.t === 's' || m.t === 'yo' || m.t === 'over') this.take(m);
        else if (m.t === 'lobby') { this.lobby = m; this.id = m.you; this.onLobby(m); }
        else if (m.t === 'begin') this.begin(m);
        else if (m.t === 'err') this.onError(m.msg);
      };
    });
  }
  /** A match starts (or is joined). A watcher starts by following the first player on the list. */
  begin(m: any) { this.replay = ''; this.unit = m.unit; this.inbox = []; this.out = []; this.watch = m.watch ? { follow: +(Object.keys(m.names || {})[0] || 0), team: 0 } : null; this.onBegin(m); }
  /** A message from wherever the match runs: the server, or a replay playing in this page. */
  take(m: any) { if (m.t === 'over') this.replay = m.replay || ''; if (m.t === 's' || m.t === 'yo' || m.t === 'over') { if (m.t === 's') this.lastSnap = performance.now(); this.inbox.push(m); if (this.inbox.length > 600) this.squash(); } else if (m.t === 'begin') this.begin(m); }
  /** Nobody is reading the mail (a hidden tab, say). Fold the oldest world picture into the next one, keeping its events, so the pile stays small. */
  squash() { const i = this.inbox.findIndex(x => x.t === 's'), j = this.inbox.findIndex((x, k) => k > i && x.t === 's'); if (i < 0 || j < 0) return; this.inbox[j].e = this.inbox[i].e.concat(this.inbox[j].e); this.inbox.splice(i, 1); }
  send(o: any) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  /** Queues one action for the server. It goes out with the next position update. */
  cmd(...a: any[]) { this.out.push(a); }
  flush(me: any[] | null) { if (!me && !this.out.length) return; this.send({ t: 'in', me, c: this.out }); this.out = []; }
  close() { this.open = false; try { this.ws?.close(); } catch (e) { /* already gone */ } this.ws = null; }
}
