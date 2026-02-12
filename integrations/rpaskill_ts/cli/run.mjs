import fs from 'node:fs';
import path from 'node:path';
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

function readJson(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function writeJson(filePath, obj) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
  return resolved;
}

function ensureDirForFile(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.action;
  const inputPath = args.input;
  const outputPath = args.output;
  const executablePath = args.executablePath;

  if (args.help || !action || !inputPath || !outputPath) {
    console.log(`Usage:
  node cli/run.mjs --action <webSearch|adaptiveSearch|inspectPage|searchOnSite|searchProductsHeuristic> --input <config.json> --output <out.json> [--headless true|false] [--channel chrome|msedge] [--executablePath <path>]
`);
    process.exitCode = 2;
    return;
  }

  const config = readJson(inputPath);
  const rpa = new RPASkill();
  let saveStorageTarget = null;
  let storageSaved = false;
  try {
    if (config.saveStorageStatePath) {
      saveStorageTarget = ensureDirForFile(config.saveStorageStatePath);
    }

    await rpa.initBrowser({
      headless: toBool(args.headless ?? config.headless, true),
      channel: args.channel ?? config.channel,
      executablePath: executablePath ?? config.executablePath,
      slowMo: toInt(config.slowMo, 0),
      timeout: toInt(config.timeout, 0),
      proxy: config.proxy,
      args: config.args,
      userDataDir: config.userDataDir,
      storageStatePath: config.storageStatePath,
      // Allow explicit `viewport: null` in config.
      viewport: hasOwn(config, 'viewport') ? config.viewport : { width: 1440, height: 900 },
    });

    let response;
    if (action === 'webSearch') {
      response = await rpa.webSearch({
        engine: config.engine ?? 'bing',
        query: config.query,
        pages: toInt(config.pages, 2),
        perPage: toInt(config.perPage, 10),
        details: toInt(config.details, 0),
        preferredDomains: config.preferredDomains,
        keywords: config.keywords,
        screenshotPrefix: config.screenshotPrefix,
        openScreenshotPrefix: config.openScreenshotPrefix,
        openScreenshotFullPage: config.openScreenshotFullPage,
        tracePath: config.tracePath,
        traceAppend: !!config.traceAppend,
        afterSearchDelayMs: config.afterSearchDelayMs,
        navigationTimeout: config.navigationTimeout,
        baikeUrl: config.baikeUrl,
      });
    } else if (action === 'adaptiveSearch') {
      response = await rpa.adaptiveSearch({
        query: config.query,
        goal: config.goal,
        language: config.language,
        engine: config.engine,
        pages: toInt(config.pages, 2),
        perPage: toInt(config.perPage, 10),
        details: toInt(config.details, 0),
        minResults: toInt(config.minResults, 5),
        maxRounds: toInt(config.maxRounds, 2),
        strictKeywords: !!config.strictKeywords,
        keywords: config.keywords,
        logEnabled: !!config.logEnabled,
        logPath: config.logPath,
        logFormat: config.logFormat,
        logAppend: !!config.logAppend,
        logFlushEachRound: !!config.logFlushEachRound,
        logIncludeResults: config.logIncludeResults ?? true,
        logIncludeOpened: config.logIncludeOpened ?? false,
        logIncludeSnippets: config.logIncludeSnippets ?? true,
        logMaxResults: toInt(config.logMaxResults, 5),
        logMaxOpened: toInt(config.logMaxOpened, 3),
        screenshotPrefix: config.screenshotPrefix,
        openScreenshotPrefix: config.openScreenshotPrefix,
        openScreenshotFullPage: config.openScreenshotFullPage,
        tracePath: config.tracePath,
        traceAppend: !!config.traceAppend,
        afterSearchDelayMs: config.afterSearchDelayMs,
        navigationTimeout: config.navigationTimeout,
        baikeUrl: config.baikeUrl,
      });
    } else if (action === 'inspectPage') {
      response = await rpa.inspectPage({
        url: config.url,
        waitUntil: config.waitUntil,
        waitForSelector: config.waitForSelector,
        timeout: config.timeout,
        capturePrefix: config.capturePrefix,
        captureFullPage: config.captureFullPage,
        includeHtml: config.includeHtml,
        includeAccessibility: config.includeAccessibility,
        includeElements: config.includeElements,
        maxElements: config.maxElements,
        tracePath: config.tracePath,
        traceAppend: !!config.traceAppend,
        detectBlockers: config.detectBlockers,
        pauseForHuman: !!config.pauseForHuman,
        pauseMessage: config.pauseMessage,
        pauseTimeoutMs: config.pauseTimeoutMs,
      });
    } else if (action === 'searchOnSite') {
      response = await rpa.searchOnSite({
        url: config.url,
        searchUrl: config.searchUrl,
        query: config.query,
        searchInput: config.searchInput,
        searchButton: config.searchButton,
        submitByEnter: config.submitByEnter,
        resultsWaitFor: config.resultsWaitFor,
        waitForLoadState: config.waitForLoadState,
        limit: config.limit,
        screenshotPath: config.screenshotPath,
        baseUrl: config.baseUrl,
        navigationTimeout: config.navigationTimeout,
        navigationWaitUntil: config.navigationWaitUntil,
        inputTimeout: config.inputTimeout,
        resultsTimeout: config.resultsTimeout,
        beforeSearchDelayMs: config.beforeSearchDelayMs,
        afterSearchDelayMs: config.afterSearchDelayMs,
        cookieAcceptSelector: config.cookieAcceptSelector,
        pauseForHuman: !!config.pauseForHuman,
        pauseForHumanMode: config.pauseForHumanMode,
        pauseMessage: config.pauseMessage,
        pauseTimeoutMs: config.pauseTimeoutMs,
        stepDelayMs: config.stepDelayMs,
        stepDelayJitterMs: config.stepDelayJitterMs,
        typeDelayMs: config.typeDelayMs,
        typeDelayJitterMs: config.typeDelayJitterMs,
        tracePath: config.tracePath,
        traceAppend: !!config.traceAppend,
        capturePrefix: config.capturePrefix,
        captureFullPage: config.captureFullPage,
        includeHtml: config.includeHtml,
        includeElements: config.includeElements,
        maxElements: config.maxElements,
        captureOnBlocked: config.captureOnBlocked,
        captureOnDone: config.captureOnDone,
        detectBlockers: config.detectBlockers,
        list: config.list,
      });
    } else if (action === 'searchProductsHeuristic') {
      response = await rpa.searchProductsHeuristic({
        searchUrl: config.searchUrl,
        resultsWaitFor: config.resultsWaitFor,
        waitForLoadState: config.waitForLoadState,
        resultsTimeout: config.resultsTimeout,
        afterSearchDelayMs: config.afterSearchDelayMs,
        pauseForHuman: !!config.pauseForHuman,
        pauseForHumanMode: config.pauseForHumanMode,
        pauseMessage: config.pauseMessage,
        pauseTimeoutMs: config.pauseTimeoutMs,
        stepDelayMs: config.stepDelayMs,
        stepDelayJitterMs: config.stepDelayJitterMs,
        scrollSteps: config.scrollSteps,
        scrollDelayMs: config.scrollDelayMs,
        tracePath: config.tracePath,
        traceAppend: !!config.traceAppend,
        capturePrefix: config.capturePrefix,
        captureFullPage: config.captureFullPage,
        includeHtml: config.includeHtml,
        includeElements: config.includeElements,
        maxElements: config.maxElements,
        captureOnBlocked: config.captureOnBlocked,
        captureOnDone: config.captureOnDone,
        detectBlockers: config.detectBlockers,
        limit: config.limit,
        baseUrl: config.baseUrl,
        screenshotPath: config.screenshotPath,
      });
    } else {
      throw new Error(`Unknown --action: ${action}`);
    }

    const out = {
      ok: true,
      action,
      response,
    };

    if (saveStorageTarget) {
      await rpa.saveStorageState(saveStorageTarget);
      storageSaved = true;
      out.savedStorageStatePath = saveStorageTarget;
    }
    const resolved = writeJson(outputPath, out);
    console.log(resolved);
  } finally {
    // Best-effort: still persist storageState even if the action throws (e.g., timeouts),
    // so a human can log in once and subsequent runs can reuse the session.
    if (saveStorageTarget && !storageSaved) {
      try {
        await rpa.saveStorageState(saveStorageTarget);
      } catch {
        // ignore
      }
    }
    await rpa.closeBrowser();
  }
}

main().catch((err) => {
  console.error('rpaskill_ts runner failed:', err);
  process.exitCode = 1;
});
