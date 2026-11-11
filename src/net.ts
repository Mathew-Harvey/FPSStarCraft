// The browser's side of a multiplayer match: one WebSocket to the match server.
export interface LobbyPlayer { id: number; name: string; ready: boolean }
export interface Lobby { code: string; you: number; host: number; map: number; diff: number; players: LobbyPlayer[]; state: 'lobby' | 'play' }

export class Net {
  ws: WebSocket | null = null; id = 0; unit = 0; lobby: Lobby | null = null; open = false;
  /** Snapshots and other in-match messages wait here until the game loop is ready for them. */
  inbox: any[] = []; out: any[][] = []; sendT = 0; lastSnap = 0;
  onLobby: (l: Lobby) => void = () => { /* set by the menu */ };
  onBegin: (m: { map: number; diff: number; unit: number; names: Record<number, string> }) => void = () => { /* set by the menu */ };
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
        if (m.t === 's' || m.t === 'yo' || m.t === 'over') { if (m.t === 's') this.lastSnap = performance.now(); this.inbox.push(m); }
        else if (m.t === 'lobby') { this.lobby = m; this.id = m.you; this.onLobby(m); }
        else if (m.t === 'begin') { this.unit = m.unit; this.inbox = []; this.out = []; this.onBegin(m); }
        else if (m.t === 'err') this.onError(m.msg);
      };
    });
  }
  send(o: any) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  /** Queues one action for the server. It goes out with the next position update. */
  cmd(...a: any[]) { this.out.push(a); }
  flush(me: any[] | null) { if (!me && !this.out.length) return; this.send({ t: 'in', me, c: this.out }); this.out = []; }
  close() { this.open = false; try { this.ws?.close(); } catch (e) { /* already gone */ } this.ws = null; }
}
