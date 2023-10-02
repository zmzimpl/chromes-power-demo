import SocksProxyServer from "./socks-proxy-server.js";

SocksProxyServer({
  listenHost: "127.0.0.1",
  listenPort: 30030,
  socksHost: "remote host", // host
  socksPort: 62675, // 端口
  socksUsername: "username", // 用户名
  socksPassword: "password", // 密码
});
