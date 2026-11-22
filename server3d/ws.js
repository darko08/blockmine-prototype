// A small WebSocket server (RFC 6455), text frames only, no packages. Enough for the shaft: JSON messages both ways.
'use strict';
const crypto = require('crypto');
const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 64 * 1024;   // a client never needs to send more than this in one message

function accept(req, socket, onOpen) {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const hash = crypto.createHash('sha1').update(key + MAGIC).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + hash + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = { socket, open: true, onmessage: null, onclose: null, ip: req.headers['x-forwarded-for'] || socket.remoteAddress,
    sentBytes: 0, gotBytes: 0, frag: null };
  let buf = Buffer.alloc(0);
  conn.send = (obj) => {
    if (!conn.open) return;
    const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
    const len = data.length, head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return h; })();
    conn.sentBytes += head.length + len;
    socket.write(Buffer.concat([head, data]));
  };
  conn.close = (code = 1000) => {
    if (!conn.open) return;
    conn.open = false;
    try { socket.write(Buffer.from([0x88, 2, code >> 8, code & 255])); socket.end(); } catch (e) {}
    if (conn.onclose) conn.onclose();
  };
  const control = (op, payload) => { if (conn.open) socket.write(Buffer.concat([Buffer.from([0x80 | op, payload.length]), payload])); };
  socket.on('data', (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk; conn.gotBytes += chunk.length;
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!masked || len > MAX_FRAME) { conn.close(1009); socket.destroy(); return; }   // clients must mask; no huge frames
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 0x8) { conn.close(); return; }
      if (op === 0x9) { control(0xA, data.subarray(0, 125)); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        conn.frag = conn.frag ? Buffer.concat([conn.frag, data]) : data;
        if (conn.frag.length > MAX_FRAME) { conn.close(1009); return; }
        if (!fin) continue;
        const text = conn.frag.toString('utf8'); conn.frag = null;
        let msg; try { msg = JSON.parse(text); } catch (e) { continue; }
        if (conn.onmessage) conn.onmessage(msg);
      }
    }
  });
  const gone = () => { if (conn.open) { conn.open = false; if (conn.onclose) conn.onclose(); } };
  socket.on('close', gone); socket.on('error', gone);
  onOpen(conn);
}

// a client for the load test and the server's own checks (Node 22+ has a WebSocket client built in, used when present)
module.exports = { accept };
