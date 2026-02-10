import RPASkill from '../dist/index.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? next : 'true';
    args[key] = value;
    if (value !== 'true') i += 1;
  }
  return args;
}

function toBool(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

function toInt(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(`Usage:
  npm run search -- [options]

Options:
  --engine bing|baike        Search engine mode (default: bing)
  --query "<text>"           Query string (default: 蚂蚁 信息素 协作 觅食 分工)
  --pages <n>                Max result pages to scan (default: 2)
  --details <n>              Open top N links and extract summary (default: 2)
  --prefer <d1,d2,...>       Preferred domains order (default: wikipedia.org,baike.baidu.com)
  --keywords <k1,k2,...>     Keyword filter regex OR list (default: 蚂蚁|信息素|协作|觅食|分工|群体)
  --headless true|false      Headless mode (default: true)
  --channel msedge|chrome    Use system browser channel (default: msedge)
  --timeout <ms>             Navigation timeout (default: 60000)
  --delay <ms>               Delay after loading (default: 1200)
  --screenshot <prefix>      Screenshot prefix (default: artifacts/screenshots/search)
  --baikeUrl <url>           Baike direct URL (engine=baike or fallback)

Examples:
  npm run search -- --engine baike --keywords 信息素,分工
  npm run search -- --engine bing --query "蚂蚁 信息素 协作" --pages 2 --details 2
`);
    return;
  }

  const engine = (args.engine ?? 'bing').toLowerCase();
  const query = args.query ?? '蚂蚁 信息素 协作 觅食 分工';
  const maxPages = toInt(args.pages, 2);
  const maxDetailPages = toInt(args.details, 2);
  const headless = toBool(args.headless, true);
  const channel = args.channel ?? 'msedge';
  const navigationTimeout = toInt(args.timeout, 60000);
  const afterSearchDelayMs = toInt(args.delay, 1200);
  const screenshotPrefix = args.screenshot ?? 'artifacts/screenshots/search';
  const preferredDomains = (args.prefer ?? 'wikipedia.org,baike.baidu.com').split(',').map((s) => s.trim()).filter(Boolean);
  const maxResultsPerPage = toInt(args.perPage, 10);

  const rpa = new RPASkill();
  try {
    await rpa.initBrowser({
      headless,
      channel,
      viewport: { width: 1440, height: 900 },
    });

    const keywords = args.keywords ? args.keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const response = await rpa.webSearch({
      engine,
      query,
      pages: maxPages,
      perPage: maxResultsPerPage,
      details: maxDetailPages,
      preferredDomains,
      keywords,
      screenshotPrefix,
      afterSearchDelayMs,
      navigationTimeout,
      baikeUrl: args.baikeUrl,
    });

    if (response.results.length > 0) {
      console.log('\n候选结果（已去重/过滤/排序）:');
      response.results.slice(0, Math.min(response.results.length, 10)).forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.title}`);
        if (item.snippet) console.log(`   摘要: ${item.snippet}`);
        console.log(`   链接: ${item.url}`);
        console.log('------------------------------------');
      });
    }

    if (response.opened.length > 0) {
      console.log('\n点开摘要:');
      response.opened.forEach((item) => {
        console.log(`\n打开：${item.title}`);
        console.log(`链接：${item.url}`);
        console.log('摘要:');
        console.log(item.summary || '(未提取到摘要)');
      });
    }
  } finally {
    await rpa.closeBrowser();
  }
}

main().catch((error) => {
  console.error('运行失败:', error);
  process.exitCode = 1;
});
