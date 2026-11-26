// Talks to the game server. With ?mock in the URL it uses the in-browser mock instead.
//
// Server -> browser: waiting, level_start, tick, log, flag_result, level_end
// Browser -> server: join, flag, send_engineer, turn_off
// See README.md for the fields in each message.

export async function connect(onMessage) {
  if (new URLSearchParams(location.search).has('mock')) {
    const { createMockServer } = await import('./mock-server.js');
    return createMockServer(onMessage);
  }

  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  let ws;
  let joinMsg = null;   // resent after every reconnect so the server can resume the run
  let queue = [];

  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      if (joinMsg) ws.send(joinMsg);
      queue.forEach((m) => ws.send(m));
      queue = [];
    };
    ws.onmessage = (e) => onMessage(JSON.parse(e.data));
    ws.onclose = () => setTimeout(open, 1000);
  }
  open();

  return {
    send(msg) {
      const text = JSON.stringify(msg);
      if (msg.type === 'join') joinMsg = text;
      if (ws.readyState === WebSocket.OPEN) ws.send(text);
      else if (msg.type !== 'join') queue.push(text);
    },
  };
}
