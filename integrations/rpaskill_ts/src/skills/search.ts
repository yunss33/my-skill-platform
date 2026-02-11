import { browserManager } from '../core/browser.js';
import { helper } from '../utils/helper.js';
import { ListExtractionOptions, ListExtractionProfile, SearchResultRecord, SearchTaskOptions } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!dir || dir === '.') return;
  fs.mkdirSync(dir, { recursive: true });
}

type TraceWriter = (rec: Record<string, unknown>) => void;

function createTraceWriter(tracePath?: string, traceAppend?: boolean): TraceWriter {
  if (!tracePath) return () => undefined;
  try {
    ensureDirForFile(tracePath);
    if (!traceAppend) {
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
      // best-effort
    }
  };
}

function randInt(min: number, max: number): number {
  const mn = Math.ceil(min);
  const mx = Math.floor(max);
  if (mx <= mn) return mn;
  return mn + Math.floor(Math.random() * (mx - mn + 1));
}

async function stepDelay(baseMs?: number, jitterMs?: number): Promise<void> {
  const base = Number(baseMs ?? 0);
  const jitter = Number(jitterMs ?? 0);
  const ms = base > 0 ? base + (jitter > 0 ? randInt(0, jitter) : 0) : 0;
  if (ms > 0) {
    await helper.delay(ms);
  }
}

async function captureArtifacts(
  prefix: string,
  options: {
    captureFullPage?: boolean;
    includeHtml?: boolean;
    includeElements?: boolean;
    maxElements?: number;
  }
): Promise<{
  screenshotPath?: string;
  htmlPath?: string;
  elementsPath?: string;
  elementCount?: number;
}> {
  const page = await browserManager.getPage();
  const out: { screenshotPath?: string; htmlPath?: string; elementsPath?: string; elementCount?: number } = {};

  const screenshotPath = `${prefix}_screenshot.png`;
  try {
    ensureDirForFile(screenshotPath);
    await page.screenshot({ path: screenshotPath, fullPage: !!options.captureFullPage });
    out.screenshotPath = screenshotPath;
  } catch {
    // ignore
  }

  if (options.includeHtml) {
    const htmlPath = `${prefix}_page.html`;
    try {
      ensureDirForFile(htmlPath);
      const html = await page.content();
      fs.writeFileSync(htmlPath, html, 'utf-8');
      out.htmlPath = htmlPath;
    } catch {
      // ignore
    }
  }

  if (options.includeElements) {
    const elementsPath = `${prefix}_elements.json`;
    const limit = Math.max(1, Math.min(Number(options.maxElements ?? 200), 2000));
    try {
      ensureDirForFile(elementsPath);
      const url = page.url();
      const title = await page.title().catch(() => '');
      const elements = await page.evaluate((max) => {
        const nodes = Array.from(
          document.querySelectorAll('a,button,input,select,textarea,[role="button"],[onclick]')
        ) as HTMLElement[];

        const out: Array<Record<string, unknown>> = [];
        const vw = window.innerWidth || 0;
        const vh = window.innerHeight || 0;

        const isVisible = (el: HTMLElement, rect: DOMRect) => {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (Number.parseFloat(style.opacity || '1') <= 0.02) return false;
          if (rect.width < 6 || rect.height < 6) return false;
          if (rect.bottom < 0 || rect.right < 0) return false;
          if (rect.top > vh || rect.left > vw) return false;
          return true;
        };

        for (const el of nodes) {
          if (out.length >= max) break;
          const rect = el.getBoundingClientRect();
          if (!isVisible(el, rect)) continue;

          const tag = (el.tagName || '').toLowerCase();
          const role = el.getAttribute('role') || undefined;
          const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          const id = el.getAttribute('id') || undefined;
          const name = el.getAttribute('name') || undefined;
          const type = el.getAttribute('type') || undefined;
          const placeholder = el.getAttribute('placeholder') || undefined;
          const ariaLabel = el.getAttribute('aria-label') || undefined;
          const href = (tag === 'a' ? (el as HTMLAnchorElement).href : '') || undefined;

          out.push({
            index: out.length + 1,
            tag,
            role,
            text,
            id,
            name,
            type,
            placeholder,
            ariaLabel,
            href,
            bbox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              cx: rect.x + rect.width / 2,
              cy: rect.y + rect.height / 2,
            },
          });
        }
        return out;
      }, limit);

      fs.writeFileSync(elementsPath, JSON.stringify({ url, title, elements }, null, 2) + '\n', 'utf-8');
      out.elementsPath = elementsPath;
      out.elementCount = Array.isArray(elements) ? elements.length : undefined;
    } catch {
      // ignore
    }
  }

  return out;
}

async function waitForHuman(message?: string, timeoutMs?: number): Promise<'continued' | 'timeout'> {
  if (message) {
    // eslint-disable-next-line no-console
    console.log(message);
  }

  // Non-interactive stdin: fall back to timeout-based wait (or no-op).
  if (!process.stdin || !process.stdin.isTTY) {
    if (!timeoutMs || timeoutMs <= 0) return 'timeout';
    await new Promise((r) => setTimeout(r, timeoutMs));
    return 'timeout';
  }

  process.stdin.resume();
  const timer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          try {
            process.stdin.pause();
          } catch {
            // ignore
          }
        }, timeoutMs)
      : null;

  try {
    await Promise.race([
      once(process.stdin, 'data'),
      ...(timeoutMs && timeoutMs > 0 ? [new Promise((r) => setTimeout(r, timeoutMs))] : []),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      process.stdin.pause();
    } catch {
      // ignore
    }
  }

  return 'continued';
}

async function isLikelyBlocked(): Promise<boolean> {
  const page = await browserManager.getPage();
  const url = page.url();
  if (/risk_handler/i.test(url)) return true;
  try {
    const count = await page.locator('text=/验证码|人机验证|请完成验证|安全验证|captcha/i').count();
    if (count > 0) return true;
  } catch {
    // ignore
  }
  return false;
}

async function waitUntilSelectorVisible(selector: string, timeoutMs?: number): Promise<boolean> {
  const maxWait = timeoutMs && timeoutMs > 0 ? timeoutMs : 10 * 60 * 1000;
  const deadline = Date.now() + maxWait;

  // Keep trying across navigations while the user solves verification.
  // Use short timeouts per attempt so we can recover from navigation/context resets.
  while (Date.now() < deadline) {
    // Re-fetch page each loop so closed tabs can be recreated (BrowserManager.getPage handles this).
    const page = await browserManager.getPage();
    const remaining = deadline - Date.now();
    const stepTimeout = Math.min(2000, Math.max(250, remaining));
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout: stepTimeout });
      return true;
    } catch (error) {
      const msg = String(error);
      if (
        msg.includes('Execution context was destroyed') ||
        msg.includes('Cannot find context') ||
        msg.includes('Target closed')
      ) {
        // Navigation happened; retry.
      }
    }
    await helper.delay(500);
  }
  return false;
}

export class SearchSkill {
  async extractList(profile: ListExtractionProfile, options: ListExtractionOptions = {}): Promise<SearchResultRecord[]> {
    const page = await browserManager.getPage();
    const limit = options.limit ?? 20;
    const baseUrl = options.baseUrl ?? page.url();

    if (!profile.itemSelector) {
      throw new Error('ListExtractionProfile.itemSelector is required.');
    }

    const results = await page.$$eval(
      profile.itemSelector,
      (items, payload) => {
        const { fields, limit, baseUrl } = payload;
        const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
        const output: Array<Record<string, string | number>> = [];
        const max = Math.min(items.length, limit);

        for (let i = 0; i < max; i++) {
          const item = items[i];
          const record: Record<string, string | number> = { index: i + 1 };

          for (const key of Object.keys(fields)) {
            const field = fields[key];
            const el = item.querySelector(field.selector);
            let value = '';

            if (el) {
              if (!field.attr || field.attr === 'text') {
                value = el.textContent || '';
              } else if (field.attr === 'html') {
                value = el.innerHTML || '';
              } else {
                value = el.getAttribute(field.attr) || '';
              }
            }

            if (field.trim !== false) {
              value = normalize(value);
            }

            if (value && (field.attr === 'href' || field.attr === 'src' || field.attr === 'url')) {
              try {
                value = new URL(value, baseUrl).toString();
              } catch {
                // Keep original value when URL parsing fails.
              }
            }

            record[key] = value;
          }

          output.push(record);
        }

        return output;
      },
      {
        fields: profile.fields,
        limit,
        baseUrl,
      }
    );

    return results as SearchResultRecord[];
  }

  async searchOnSite(options: SearchTaskOptions): Promise<SearchResultRecord[]> {
    const page = await browserManager.getPage();
    const pauseModeRequested = options.pauseForHumanMode ?? 'auto';
    // When stdin is not interactive (non-TTY), "enter" mode cannot work; fall back to auto polling.
    const pauseMode: 'auto' | 'enter' =
      pauseModeRequested === 'enter' && !!process.stdin && process.stdin.isTTY ? 'enter' : 'auto';

    const trace = createTraceWriter(options.tracePath, options.traceAppend);
    const paceStepDelayMs = options.stepDelayMs ?? 0;
    const paceStepDelayJitterMs = options.stepDelayJitterMs ?? 0;
    const typeDelayMs = options.typeDelayMs ?? 0;
    const typeDelayJitterMs = options.typeDelayJitterMs ?? 0;

    const capturePrefix = options.capturePrefix;
    const captureFullPage = !!options.captureFullPage;
    const includeHtml = !!options.includeHtml;
    const includeElements = !!options.includeElements;
    const maxElements = options.maxElements ?? 200;
    const captureOnBlocked = !!options.captureOnBlocked;
    const captureOnDone = !!options.captureOnDone;

    trace({ event: 'searchOnSite.start', url: page.url(), pauseMode });

    const navigationTimeout = options.navigationTimeout ?? 30000;
    const navigationWaitUntil = options.navigationWaitUntil ?? 'domcontentloaded';

    if (options.searchUrl) {
      await stepDelay(paceStepDelayMs, paceStepDelayJitterMs);
      await page.goto(options.searchUrl, {
        timeout: navigationTimeout,
        waitUntil: navigationWaitUntil,
      });
      trace({ event: 'searchOnSite.goto', url: page.url() });
    } else if (options.url) {
      await stepDelay(paceStepDelayMs, paceStepDelayJitterMs);
      await page.goto(options.url, {
        timeout: navigationTimeout,
        waitUntil: navigationWaitUntil,
      });
      trace({ event: 'searchOnSite.goto', url: page.url() });
    }

    // Bring window to front for visible runs so the user can see/interact.
    try {
      await page.bringToFront();
    } catch {
      // ignore
    }

    // If the site immediately redirects to a verification page, hint early and optionally capture artifacts.
    const blockedEarly = (options.pauseForHuman || options.detectBlockers) && (await isLikelyBlocked());
    if (blockedEarly) {
      const msg =
        options.pauseMessage ??
        `Page seems blocked (login/captcha/verification).\nCurrent URL: ${page.url()}\nPlease complete it in the browser; the skill will auto-continue when results appear.`;
      // eslint-disable-next-line no-console
      console.log(msg);
      trace({ event: 'searchOnSite.blocked', url: page.url(), message: msg });

      if (capturePrefix && captureOnBlocked) {
        const cap = await captureArtifacts(`${capturePrefix}_blocked`, {
          captureFullPage,
          includeHtml,
          includeElements,
          maxElements,
        });
        trace({ event: 'searchOnSite.capture.blocked', url: page.url(), ...cap });
        if (cap.screenshotPath || cap.htmlPath || cap.elementsPath) {
          // eslint-disable-next-line no-console
          console.log(`Captured artifacts: ${cap.screenshotPath ?? ''} ${cap.htmlPath ?? ''} ${cap.elementsPath ?? ''}`.trim());
        }
      }

      if (options.pauseForHuman && pauseMode === 'enter') {
        // Let the user decide when to continue (more reliable than auto-detect on heavily protected sites).
        await waitForHuman('Press Enter after you finish verification/login in the browser...', options.pauseTimeoutMs);
      }
    }

    if (options.cookieAcceptSelector) {
      await stepDelay(paceStepDelayMs, paceStepDelayJitterMs);
      await this.tryClick(options.cookieAcceptSelector, 2000);
    }

    if (!options.searchUrl) {
      if (!options.searchInput) {
        throw new Error('searchInput is required when searchUrl is not provided.');
      }

      await page.waitForSelector(options.searchInput, {
        state: 'visible',
        timeout: options.inputTimeout ?? 30000,
      });

      if (options.beforeSearchDelayMs) {
        await helper.delay(options.beforeSearchDelayMs);
      }

      // Best-effort "human-ish" typing to reduce bot signals.
      await stepDelay(paceStepDelayMs, paceStepDelayJitterMs);
      try {
        const loc = page.locator(options.searchInput);
        await loc.click({ timeout: options.inputTimeout ?? 30000 });
        await loc.fill('');
        if (typeDelayMs && typeDelayMs > 0) {
          await loc.type(options.query, {
            delay: typeDelayMs + (typeDelayJitterMs && typeDelayJitterMs > 0 ? randInt(0, typeDelayJitterMs) : 0),
          });
        } else {
          await loc.fill(options.query);
        }
      } catch {
        await page.fill(options.searchInput, options.query);
      }

      if (options.searchButton) {
        await stepDelay(paceStepDelayMs, paceStepDelayJitterMs);
        await page.click(options.searchButton);
      } else if (options.submitByEnter ?? true) {
        await stepDelay(paceStepDelayMs, paceStepDelayJitterMs);
        await page.keyboard.press('Enter');
      } else {
        throw new Error('searchButton or submitByEnter must be provided.');
      }
    }

    if (options.resultsWaitFor) {
      try {
        await page.waitForSelector(options.resultsWaitFor, {
          state: 'visible',
          timeout: options.resultsTimeout ?? 30000,
        });
      } catch (error) {
        const blocked = (options.pauseForHuman || options.detectBlockers) && (await isLikelyBlocked());
        if (options.pauseForHuman) {
          const msg =
            options.pauseMessage ??
            `Page seems blocked (login/captcha/verification).\nCurrent URL: ${page.url()}\nPlease complete it in the browser; the skill will auto-continue when results appear.`;
          // eslint-disable-next-line no-console
          console.log(msg);
          trace({ event: 'searchOnSite.blocked', url: page.url(), message: msg });

          if (capturePrefix && captureOnBlocked) {
            const cap = await captureArtifacts(`${capturePrefix}_blocked`, {
              captureFullPage,
              includeHtml,
              includeElements,
              maxElements,
            });
            trace({ event: 'searchOnSite.capture.blocked', url: page.url(), ...cap });
            if (cap.screenshotPath || cap.htmlPath || cap.elementsPath) {
              // eslint-disable-next-line no-console
              console.log(
                `Captured artifacts: ${cap.screenshotPath ?? ''} ${cap.htmlPath ?? ''} ${cap.elementsPath ?? ''}`.trim()
              );
            }
          }

          if (pauseMode === 'enter' && options.pauseForHuman) {
            const deadline =
              options.pauseTimeoutMs && options.pauseTimeoutMs > 0 ? Date.now() + options.pauseTimeoutMs : null;
            // Loop: user presses Enter when they believe the results page is ready; we re-check the selector.
            // This avoids long "silent waiting" when the site throttles/blocks results rendering.
            while (true) {
              if (deadline && Date.now() > deadline) {
                throw new Error(`Human-in-the-loop wait timed out. Still cannot find selector: ${options.resultsWaitFor}`);
              }

              const res = await waitForHuman('Press Enter to retry detection of results...', options.pauseTimeoutMs);
              if (res === 'timeout' && options.pauseTimeoutMs && options.pauseTimeoutMs > 0) {
                throw new Error(`Human-in-the-loop wait timed out. Still cannot find selector: ${options.resultsWaitFor}`);
              }
              try {
                const p = await browserManager.getPage();
                await p.waitForSelector(options.resultsWaitFor, { state: 'visible', timeout: 2000 });
                break;
              } catch {
                // Keep waiting; user can solve more steps and press Enter again.
              }
            }
          } else {
            const ok = await waitUntilSelectorVisible(
              options.resultsWaitFor,
              Math.max(options.pauseTimeoutMs ?? 0, options.resultsTimeout ?? 0, 10 * 60 * 1000)
            );
            if (!ok) {
              throw new Error(`Human-in-the-loop wait timed out. Still cannot find selector: ${options.resultsWaitFor}`);
            }
          }
        } else if (blocked) {
          // No human-in-loop requested: fail fast instead of silently waiting ~10min.
          trace({ event: 'searchOnSite.blocked', url: page.url(), pauseForHuman: false });
          throw new Error(
            `Page seems blocked (login/captcha/verification) and pauseForHuman=false.\nCurrent URL: ${page.url()}`
          );
        } else {
          throw error;
        }
      }
    }

    if (options.waitForLoadState) {
      await page.waitForLoadState(options.waitForLoadState, {
        timeout: options.resultsTimeout ?? 30000,
      });
    }

    if (options.afterSearchDelayMs) {
      await helper.delay(options.afterSearchDelayMs);
    }

    if (options.screenshotPath) {
      ensureDirForFile(options.screenshotPath);
      await page.screenshot({ path: options.screenshotPath });
      trace({ event: 'searchOnSite.screenshot', url: page.url(), screenshotPath: options.screenshotPath });
    }

    try {
      const out = await this.extractList(options.list, {
        limit: options.limit,
        baseUrl: options.baseUrl ?? page.url(),
      });

      if (capturePrefix && captureOnDone) {
        const cap = await captureArtifacts(`${capturePrefix}_done`, {
          captureFullPage,
          includeHtml,
          includeElements,
          maxElements,
        });
        trace({ event: 'searchOnSite.capture.done', url: page.url(), ...cap });
      }

      trace({ event: 'searchOnSite.end', url: page.url(), count: out.length });
      return out;
    } catch (error) {
      const message = String(error);
      if (
        message.includes('Execution context was destroyed') ||
        message.includes('Cannot find context') ||
        message.includes('Target closed')
      ) {
        await page.waitForLoadState('domcontentloaded', {
          timeout: options.resultsTimeout ?? 30000,
        });
        await helper.delay(500);
        const out = await this.extractList(options.list, {
          limit: options.limit,
          baseUrl: options.baseUrl ?? page.url(),
        });
        trace({ event: 'searchOnSite.end', url: page.url(), count: out.length });
        return out;
      }
      trace({ event: 'searchOnSite.error', url: page.url(), error: (error as Error)?.message ?? String(error) });
      throw error;
    }
  }

  private async tryClick(selector: string, timeout: number): Promise<void> {
    const page = await browserManager.getPage();
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout });
      await page.click(selector);
    } catch {
      // Optional click; ignore when not found.
    }
  }
}

export const searchSkill = new SearchSkill();
