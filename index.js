import puppeteer from "puppeteer";
import { execSync, spawn } from "child_process";
import readline from "readline";
import axios from "axios";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";

const BASE_PORT = 9222;
const TOTAL_WINDOWS = 1;
// Chrome 安装路径
const CHROME_PATH =
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
const BASE_PROXIES_PORT = 30000;
// 窗口的缓存路径，不指定的话每次打开都会清空数据
const CACHE_PATH = "D:\\chromes\\users\\";

const HOST = "127.0.0.1";

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:86.0) Gecko/20100101 Firefox/86.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
];

// 获取端口之前先测试一下是否能够调通，可以的话就不获取了，避免浪费
async function preTestIP(port) {
  console.log(`Pre-test Proxy: ${HOST}:${port}`);
  const httpsAgent = new HttpsProxyAgent(`http://${HOST}:${port}`);
  try {
    // @ts-ignore
    const response = await axios.get("https://ipinfo.io/ip", {
      proxy: false,
      httpsAgent,
      timeout: 5000, // 5秒超时
    });

    if (response.status === 200) {
      return response.data;
    }
  } catch (error) {
    console.log("Proxy is not valid currently.");
  }
}

/**
 * 调用 922s5 接口获取代理
 * @param {*} port 端口
 * @param {*} retries 重试次数
 * @returns eg: 127.0.0.1:30000
 */
async function getProxyIP(port, retries = 3) {
  while (retries--) {
    try {
      // @ts-ignore
      const response = await axios.get(
        `http://${HOST}:9049/v1/ips?num=1&country=HK&state=all&city=all&zip=all&t=txt&port=${port}&isp=all`
      );
      return response.data;
    } catch (error) {
      console.log("Error fetching IP, retrying...");
    }
  }
}

// 获取到代理之后测试是否能够使用
async function testProxyIP(port, retries = 3) {
  const httpsAgent = new HttpsProxyAgent(`http://${HOST}:${port}`);
  while (retries--) {
    try {
      // @ts-ignore
      const response = await axios.get("https://ipinfo.io/ip", {
        proxy: false,
        httpsAgent,
        timeout: 5000, // 5秒超时
      });

      if (response.status === 200) {
        return response.data;
      }
    } catch (error) {
      console.log(
        `Proxy test failed for port ${port}, retries left: ${retries}`
      );
    }
  }
  await freePort(port);

  return false;
}

// 释放端口
const freePort = async (port) => {
  try {
    // @ts-ignore
    await axios.get(`http://10.20.2.192:9049/v1/ips?num=1&t=free&port=${port}`);
  } catch (error) {
    console.log(`Failed to release port ${port}: ${error.message}`);
  }
};

async function logError(port, message) {
  const logs = fs.existsSync("logs.json")
    ? // @ts-ignore
      JSON.parse(fs.readFileSync("logs.json"))
    : [];
  logs.push({ port, message, timestamp: new Date().toISOString() });
  fs.writeFileSync("logs.json", JSON.stringify(logs, null, 2));
}

async function automateBrowser(port, userAgent) {
  const browserURL = `http://${HOST}:${port}`;
  const browser = await puppeteer.connect({ browserURL });

  // 对新打开的页面进行 UserAgent 设置
  browser.on("targetcreated", async (target) => {
    const newPage = await target.page();
    if (newPage) {
      await newPage.setUserAgent(userAgent);
    }
  });

  const pages = await browser.pages();
  const page = pages.length ? pages[0] : await browser.newPage();
  await page.setUserAgent(userAgent);
  try {
    await page.goto("https://ip.me");
  } catch (error) {}

  // await browser.close();
}

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question(
    "Which windows do you want to execute? (all/0-49/0): ",
    async (answer) => {
      rl.close();

      let start = 0;
      let end = 0;

      if (answer === "all") {
        start = 0;
        end = TOTAL_WINDOWS - 1;
      } else if (answer.includes("-")) {
        [start, end] = answer.split("-").map(Number);
      } else {
        start = end = Number(answer);
      }

      for (let i = start; i <= end; i++) {
        const port = BASE_PORT + i;
        const userAgent = userAgents[i % userAgents.length];
        const userDataDir = `${CACHE_PATH}\\${i}`;
        const proxyPort = BASE_PROXIES_PORT + i;
        const proxy = `socks://${HOST}:${proxyPort}`;

        const preTest = await preTestIP(proxyPort); // 获取之前预测试一下要代理的 IP 是否已经获取了，避免重复获取
        if (preTest) {
          console.log("proxy success, current IP: ", preTest);
        } else {
          const isSuccess = await getProxyIP(proxyPort); // 获取IP
          if (!isSuccess) {
            await logError(proxyPort, "Failed to get IP");
            continue;
          }
          const proxyIP = await testProxyIP(proxyPort); // 测试IP
          if (!proxyIP) {
            await logError(proxyPort, "Proxy is not valid after retries");
            continue;
          }
          console.log("proxy success, current IP: ", proxyIP);
        }

        const chromeInstance = spawn(CHROME_PATH, [
          `--remote-debugging-port=${port}`,
          `--proxy-server=${proxy}`,
          `--user-data-dir=${userDataDir}`,
        ]);

        await new Promise((resolve) => setTimeout(resolve, 3000));

        try {
          await automateBrowser(port, userAgent);
        } catch (error) {
          console.log("error", error);
          execSync(`taskkill /PID ${chromeInstance.pid} /F`);
        }
      }
    }
  );
})();
