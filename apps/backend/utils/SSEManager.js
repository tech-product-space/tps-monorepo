class SSEManager {
  constructor(logging = true) {
    this.clients = {};
    this.heartbeatInterval = 20000;
    this.logging = logging;
    this.startHeartbeat();
  }

  log(...args) {
    if (this.logging) {
      console.log("[SSE]", ...args);
    }
  }

  setupSSE(res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
  }

  addClient(userId, res, req) {
    if (!this.clients[userId]) this.clients[userId] = [];
    this.clients[userId].push(res);

    this.log(`Connected: user=${userId} | total=${this.clients[userId].length}`);

    req.on("close", () => {
      this.clients[userId] = this.clients[userId].filter(c => c !== res);

      if (this.clients[userId].length === 0) {
        delete this.clients[userId];
      }

      this.log(`Disconnected: user=${userId}`);
    });
  }

  sendToUser(userId, event, data) {
    if (!this.clients[userId]) return;

    const payload = typeof data === "string" ? data : JSON.stringify(data);

    this.clients[userId].forEach(res => {
      try {
        res.write(`event: ${event}\n`);
        payload.split("\n").forEach(line => res.write(`data: ${line}\n`));
        res.write("\n");
      } catch (err) {
        this.log("Send error:", err.message);
      }
    });
  }

  broadcast(event, data) {
    Object.keys(this.clients).forEach(userId => {
      this.sendToUser(userId, event, data);
    });
  }

  startHeartbeat() {
    setInterval(() => {
      Object.keys(this.clients).forEach(userId => {
        this.clients[userId].forEach(res => {
          try {
            res.write(": heartbeat\n\n");
          } catch (err) {
            this.log("Heartbeat error:", err.message);
          }
        });
      });
    }, this.heartbeatInterval);
  }
}

module.exports = SSEManager;
