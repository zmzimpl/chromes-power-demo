import http from "http";
import url from "url";
import { SocksClient } from "socks";
import { EventEmitter } from "events";
import { SocksProxyAgent } from "socks-proxy-agent";

class HttpProxy extends EventEmitter {
  constructor(opt = {}) {
    super();
    this.opt = {
      listenHost: "localhost",
      listenPort: 12333,
      socksHost: "localhost",
      socksPort: 1080,
      ...opt,
    };
    this.proxy = {
      ipaddress: this.opt.socksHost,
      port: this.opt.socksPort,
      type: 5,
      userId: this.opt.socksUsername || "",
      password: this.opt.socksPassword || "",
    };
  }

  _request(proxy, uReq, uRes) {
    console.log(
      `_connect: Using socks proxy at: ${this.proxy.ipaddress}:${this.proxy.port}`
    );

    const u = url.parse(uReq.url);
    let socksAgent;
    if (this.proxy.userId) {
      socksAgent = new SocksProxyAgent(
        `socks://${this.proxy.userId}:${this.proxy.password}@${this.proxy.ipaddress}:${this.proxy.port}`
      );
    } else {
      socksAgent = new SocksProxyAgent(
        `socks://${this.proxy.ipaddress}:${this.proxy.port}`
      );
    }

    const options = {
      hostname: u.hostname,
      port: u.port || 80,
      path: u.path,
      method: u.method || "get",
      headers: u.headers,
      agent: socksAgent,
    };
    const pReq = http.request(options);
    pReq
      .on("response", (pRes) => {
        pRes.pipe(uRes);
        uRes.writeHead(pRes.statusCode, pRes.headers);
        this.emit("request:success");
      })
      .on("error", (e) => {
        console.log(
          `Error with request for: ${u.hostname} -`,
          e.message,
          e.stack
        );
        uRes.writeHead(500);
        uRes.end("Connection error\n");
        this.emit("request:error", e);
      });
    uReq.pipe(pReq);
  }

  _connect(proxy, uReq, uSocket, uHead) {
    console.log(
      `_connect: Using socks proxy at: ${this.proxy.ipaddress}:${this.proxy.port}`
    );

    const u = url.parse(`http://${uReq.url}`);
    const options = {
      proxy,
      destination: { host: u.hostname, port: u.port ? +u.port : null },
      command: "connect",
    };
    SocksClient.createConnection(options, (error, pSocket) => {
      if (error) {
        console.log("error", error);
        uSocket?.write(`HTTP/${uReq.httpVersion} 500 Connection error\r\n\r\n`);
        this.emit("connect:error", error);
        return;
      }
      pSocket?.socket.pipe(uSocket);
      uSocket?.pipe(pSocket?.socket);
      pSocket?.socket.on("error", (err) => {
        this.emit("socket:error", err);
        console.log("pSocket error", err);
      });
      uSocket.on("error", (err) => {
        console.log("uSocket error", err);
      });
      pSocket?.socket.write(uHead);
      uSocket?.write(
        `HTTP/${uReq.httpVersion} 200 Connection established\r\n\r\n`
      );
      this.emit("connect:success");
      pSocket?.socket.resume();
    });
  }

  start() {
    const server = http.createServer();
    server.on("connect", (...args) => {
      console.log(`Incoming CONNECT request for: ${args[0].url}`);
      this._connect(this.proxy, ...args);
    });
    server.on("request", (...args) => {
      console.log(`Incoming REQUEST for: ${args[0].url}`);
      this._request(this.proxy, ...args);
    });
    return server.listen(this.opt.listenPort, this.opt.listenHost);
  }
}

export default function SocksProxyServer(opt) {
  console.log(
    `Listen on ${opt.listenHost}:${opt.listenPort}, and forward traffic to ${opt.socksHost}:${opt.socksPort}`
  );
  const proxy = new HttpProxy(opt);
  return proxy.start();
}
