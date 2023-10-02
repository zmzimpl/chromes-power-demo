# Chrome 多窗口独立 IP、指纹管理示例代码

此代码未在实际中应用，仅作交流学习用途
文章介绍：[使用 NodeJS 实现 IP 和指纹独立的 Chrome 多开管理程序](https://blog.ulsincere.com/multiple-chrome)

## 运行

`npm install`

`node index.js`

如果你需要在 Chrome 中使用带认证的 `socks5` 代理，则参考`auth-proxy-example.js` 先监听对应的本地端口，并把流量转发到远程 `socks5` 代理，此时再使用 `index.js` 打开指定端口的 Chrome 窗口
