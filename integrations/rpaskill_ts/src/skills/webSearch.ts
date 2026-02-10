import { searchSkill } from './search.js';
import { browserManager } from '../core/browser.js';
import { WebSearchEngine, WebSearchOptions, WebSearchOpened, WebSearchResponse, WebSearchResult } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

type TraceWriter = (rec: Record<string, unknown>) => void;

function toInt(value: unknown, defaultValue: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function buildKeywordRegex(keywords: WebSearchOptions['keywords']): RegExp | null {
  if (!keywords) return null;
  if (Array.isArray(keywords)) {
    const parts = keywords.map((k) => String(k).trim()).filter(Boolean);
    if (parts.length === 0) return null;
    return new RegExp(parts.join('|'));
  }
  const text = String(keywords).trim();
  if (!text) return null;
  return new RegExp(text);
}

function scoreByDomain(url: string, preferredDomains: string[]): number {
  if (!url) return 0;
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (let i = 0; i < preferredDomains.length; i += 1) {
      const domain = preferredDomains[i].toLowerCase();
      if (host === domain || host.endsWith(`.${domain}`)) return preferredDomains.length - i;
    }
  } catch {
    // ignore
  }
  return 0;
}

function decodeBingUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('bing.com') && parsed.pathname.startsWith('/ck/a')) {
      const encoded = parsed.searchParams.get('u');
      if (!encoded) return url;
      let base64 = encoded;
      if (base64.startsWith('a1')) base64 = base64.slice(2);
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      if (decoded.startsWith('http')) return decoded;
    }
  } catch {
    // ignore
  }
  return url;
}

function normalizeUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!dir || dir === '.') return;
  fs.mkdirSync(dir, { recursive: true });
}

function createTraceWriter(tracePath?: string, traceAppend?: boolean): TraceWriter {
  if (!tracePath) return () => undefined;
  try {
    ensureDirForFile(tracePath);
    if (!traceAppend) {
      // Truncate by default to keep each run self-contained.
      fs.writeFileSync(tracePath, '', 'utf-8');
    }
  } catch {
    return () => undefined;
  }

  return (rec) => {
    try {
      const payload = { ts: new Date().toISOString(), ...rec };
      fs.appendFileSync(tracePath, `${JSON.stringify(payload)}\n`, 'utf-8');
    } catch {
      // Trace is best-effort.
    }
  };
}

function hashUrl(url: string): string {
  try {
    return crypto.createHash('sha1').update(url).digest('hex').slice(0, 10);
  } catch {
    return String(Date.now());
  }
}

async function extractBaiduBaikeDescription(): Promise<string> {
  const page = await browserManager.getPage();
  const metaDescription = await page.getAttribute('meta[name="description"]', 'content').catch(() => '');
  const html = await page.content();

  let embeddedDescription = '';
  const descMatch = html.match(/\"description\":\"(.*?)\",\"keywords\"/s);
  if (descMatch && descMatch[1]) {
    try {
      embeddedDescription = JSON.parse(`{\"description\":\"${descMatch[1]}\"}`).description;
    } catch {
      embeddedDescription = '';
    }
  }

  return embeddedDescription || metaDescription || '';
}

async function summarizeCurrentPage(keywordFilter: RegExp | null): Promise<string> {
  const page = await browserManager.getPage();
  const metaDescription = await page.getAttribute('meta[name="description"]', 'content').catch(() => '');
  if (metaDescription) return metaDescription;

  const paragraphs = await page.$$eval('p', (nodes) =>
    nodes
      .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0)
  );
  if (keywordFilter) {
    const hit = paragraphs.find((p) => keywordFilter.test(p));
    if (hit) return hit;
  }
  return paragraphs.find((p) => p.length > 60) || paragraphs[0] || '';
}

async function openAndSummarize(
  url: string,
  keywordFilter: RegExp | null,
  navigationTimeout: number,
  openScreenshotPrefix?: string,
  openScreenshotFullPage?: boolean,
  trace?: TraceWriter
): Promise<string> {
  const page = await browserManager.getPage();
  await page.goto(url, { timeout: navigationTimeout, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body', { timeout: navigationTimeout });

  if (openScreenshotPrefix) {
    const screenshotPath = `${openScreenshotPrefix}_${Date.now()}_${hashUrl(url)}.png`;
    ensureDirForFile(screenshotPath);
    await page.screenshot({ path: screenshotPath, fullPage: !!openScreenshotFullPage }).catch(() => undefined);
    trace?.({ event: 'websearch.open.screenshot', kind: 'open', url, screenshotPath });
  }

  if (/baike\.baidu\.com/i.test(url)) {
    const baikeDescription = await extractBaiduBaikeDescription();
    if (baikeDescription) return baikeDescription;

    const blocks = await page.$$eval('.lemma-summary, .para', (nodes) =>
      nodes
        .map((n) => (n.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 0)
    );
    if (keywordFilter) {
      const hit = blocks.find((p) => keywordFilter.test(p));
      if (hit) return hit;
    }
    return blocks[0] || '';
  }

  return await summarizeCurrentPage(keywordFilter);
}

export class WebSearchSkill {
  async search(options: WebSearchOptions = {}): Promise<WebSearchResponse> {
    const engine: WebSearchEngine = (options.engine ?? 'bing') as WebSearchEngine;
    const keywordFilter = buildKeywordRegex(options.keywords);
    const preferredDomains = options.preferredDomains ?? ['wikipedia.org', 'baike.baidu.com'];
    const pages = Math.max(1, toInt(options.pages, 2));
    const perPage = Math.max(5, toInt(options.perPage, 10));
    const details = Math.max(0, toInt(options.details, 0));
    const navigationTimeout = Math.max(1000, toInt(options.navigationTimeout, 60000));
    const afterSearchDelayMs = Math.max(0, toInt(options.afterSearchDelayMs, 1200));
    const screenshotPrefix = options.screenshotPrefix;
    const openScreenshotPrefix = options.openScreenshotPrefix;
    const openScreenshotFullPage = options.openScreenshotFullPage;
    const trace = createTraceWriter(options.tracePath, options.traceAppend);

    const response: WebSearchResponse = {
      engine,
      query: options.query,
      results: [],
      opened: [],
    };

    trace({ event: 'websearch.start', engine, query: options.query ?? null, pages, perPage, details });

    if (engine === 'baike') {
      response.fallbackUsed = true;
      const baikeUrl = options.baikeUrl ?? 'https://baike.baidu.com/item/%E8%9A%82%E8%9A%81/9770178';
      const summary = await openAndSummarize(
        baikeUrl,
        keywordFilter,
        navigationTimeout,
        openScreenshotPrefix,
        openScreenshotFullPage,
        trace
      );
      response.opened.push({ title: '百度百科：蚂蚁', url: baikeUrl, summary });
      trace({ event: 'websearch.end', resultCount: response.results.length, openedCount: response.opened.length, fallbackUsed: true });
      return response;
    }

    if (!options.query) {
      throw new Error('WebSearchOptions.query is required for search engines');
    }

    let startUrl: string;
    let itemSelector: string;
    let titleSelector: string;
    let snippetSelector: string;
    let linkSelector: string;

    if (engine === 'baidu') {
      startUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(options.query)}&ie=utf-8`;
      itemSelector = '#content_left .result';
      titleSelector = 'h3 a';
      snippetSelector = '.c-abstract';
      linkSelector = 'h3 a';
    } else {
      // Default to Bing
      startUrl = `https://www.bing.com/search?q=${encodeURIComponent(options.query)}&setlang=zh-hans&cc=CN`;
      itemSelector = '#b_results .b_algo';
      titleSelector = 'h2 a';
      snippetSelector = '.b_caption p';
      linkSelector = 'h2 a';
    }

    const seen = new Set<string>();
    const collected: WebSearchResult[] = [];

    for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
      let pageUrl = startUrl;
      if (engine === 'baidu' && pageIndex > 0) {
        pageUrl = `${startUrl}&pn=${pageIndex * 10}`;
      } else if (engine !== 'baidu' && pageIndex > 0) {
        const first = pageIndex * perPage + 1;
        pageUrl = `${startUrl}&first=${first}`;
      }

      const screenshotPath = screenshotPrefix
        ? `${screenshotPrefix}_${Date.now()}_p${pageIndex + 1}.png`
        : undefined;

      try {
        const results = await searchSkill.searchOnSite({
          searchUrl: pageUrl,
          query: options.query,
          waitForLoadState: 'domcontentloaded',
          afterSearchDelayMs,
          screenshotPath,
          list: {
            itemSelector,
            fields: {
              title: { selector: titleSelector, attr: 'text' },
              snippet: { selector: snippetSelector, attr: 'text' },
              link: { selector: linkSelector, attr: 'href' },
            },
          },
          limit: perPage,
        });
        trace({
          event: 'websearch.page',
          kind: 'search',
          url: pageUrl,
          pageIndex,
          extracted: results.length,
          screenshotPath: screenshotPath ?? null,
        });

        for (const item of results) {
          const title = String(item.title ?? '').trim();
          const snippet = String(item.snippet ?? '').trim();
          const rawLink = String(item.link ?? '').trim();
          const url = engine === 'bing' ? decodeBingUrl(rawLink) : rawLink;
          if (!title || !url) continue;
          if (keywordFilter && !keywordFilter.test(`${title} ${snippet}`)) continue;
          if (seen.has(url)) continue;
          seen.add(url);
          collected.push({ title, snippet, url });
        }
      } catch (error) {
        const message = (error as Error)?.message ?? String(error);
        trace({ event: 'websearch.page.error', url: pageUrl, pageIndex, error: message });
        break;
      }
    }

    response.results = collected.sort((a, b) => {
      const scoreA = scoreByDomain(a.url, preferredDomains);
      const scoreB = scoreByDomain(b.url, preferredDomains);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return 0;
    });

    trace({ event: 'websearch.collected', total: response.results.length });

    if (details > 0) {
      const top = response.results.slice(0, details);
      for (const item of top) {
        try {
          trace({ event: 'websearch.open.start', url: item.url, title: item.title });
          const summary = await openAndSummarize(
            item.url,
            keywordFilter,
            navigationTimeout,
            openScreenshotPrefix,
            openScreenshotFullPage,
            trace
          );
          response.opened.push({ title: item.title, url: item.url, summary });
          trace({ event: 'websearch.open.end', url: item.url, ok: true });
        } catch (error) {
          const message = (error as Error)?.message ?? String(error);
          response.opened.push({ title: item.title, url: item.url, summary: `[open failed] ${message}` });
          trace({ event: 'websearch.open.end', url: item.url, ok: false, error: message });
        }
      }
    }

    if (response.results.length === 0) {
      response.fallbackUsed = true;
      const baikeUrl = options.baikeUrl ?? 'https://baike.baidu.com/item/%E8%9A%82%E8%9A%81/9770178';
      try {
        trace({ event: 'websearch.fallback.start', url: baikeUrl });
        const summary = await openAndSummarize(
          baikeUrl,
          keywordFilter,
          navigationTimeout,
          openScreenshotPrefix,
          openScreenshotFullPage,
          trace
        );
        response.opened.push({ title: '百度百科：蚂蚁', url: baikeUrl, summary });
        trace({ event: 'websearch.fallback.end', ok: true });
      } catch (error) {
        const message = (error as Error)?.message ?? String(error);
        response.opened.push({ title: '百度百科：蚂蚁', url: baikeUrl, summary: `[open failed] ${message}` });
        trace({ event: 'websearch.fallback.end', ok: false, error: message });
      }
    }

    trace({ event: 'websearch.end', resultCount: response.results.length, openedCount: response.opened.length, fallbackUsed: !!response.fallbackUsed });
    return response;
  }
}

export const webSearchSkill = new WebSearchSkill();
