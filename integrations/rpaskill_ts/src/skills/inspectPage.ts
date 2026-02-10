import fs from 'node:fs';
import path from 'node:path';
import { browserManager } from '../core/browser.js';
import { InspectPageElement, InspectPageOptions, InspectPageResponse, LoadState } from '../types.js';
import { once } from 'node:events';

type TraceWriter = (rec: Record<string, unknown>) => void;

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

function truncate(text: string, max: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function buildSelectorHints(el: InspectPageElement): string[] {
  const hints: string[] = [];
  if (el.id) hints.push(`#${el.id}`);
  if (el.name) hints.push(`[name="${el.name}"]`);
  if (el.type && el.tag === 'input') hints.push(`input[type="${el.type}"]`);
  if (el.ariaLabel) hints.push(`aria=${truncate(el.ariaLabel, 60)}`);
  if (el.placeholder) hints.push(`placeholder=${truncate(el.placeholder, 60)}`);
  if (el.role) hints.push(`role=${el.role}`);
  if (el.href) hints.push(`href=${truncate(el.href, 80)}`);
  if (el.text) hints.push(`text=${truncate(el.text, 60)}`);
  return hints.slice(0, 8);
}

async function waitForHuman(message?: string, timeoutMs?: number): Promise<'continued' | 'timeout'> {
  // Print a minimal message; the real prompt should be shown by the Python CLI as well.
  if (message) {
    // eslint-disable-next-line no-console
    console.log(message);
  }

  // If stdin is not interactive, fall back to a timeout-based pause (or no-op).
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

async function extractElements(maxElements: number): Promise<InspectPageElement[]> {
  const page = await browserManager.getPage();
  const items = await page.evaluate((limit) => {
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
      // Within viewport (loose check)
      if (rect.bottom < 0 || rect.right < 0) return false;
      if (rect.top > vh || rect.left > vw) return false;
      return true;
    };

    for (const el of nodes) {
      if (out.length >= limit) break;
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
  }, maxElements);

  return items.map((raw, i) => {
    const el: InspectPageElement = {
      index: i + 1,
      tag: String(raw.tag ?? ''),
      role: raw.role ? String(raw.role) : undefined,
      text: raw.text ? String(raw.text) : undefined,
      id: raw.id ? String(raw.id) : undefined,
      name: raw.name ? String(raw.name) : undefined,
      type: raw.type ? String(raw.type) : undefined,
      placeholder: raw.placeholder ? String(raw.placeholder) : undefined,
      ariaLabel: raw.ariaLabel ? String(raw.ariaLabel) : undefined,
      href: raw.href ? String(raw.href) : undefined,
      bbox: raw.bbox as any,
    };
    el.selectorHints = buildSelectorHints(el);
    return el;
  });
}

async function detectBlockers(): Promise<string[]> {
  const page = await browserManager.getPage();
  const blockers: string[] = [];

  try {
    const pwdCount = await page.locator('input[type="password"]').count();
    if (pwdCount > 0) blockers.push('login/password');
  } catch {
    // ignore
  }

  try {
    const captchaCount = await page.locator('text=/验证码|人机验证|captcha/i').count();
    if (captchaCount > 0) blockers.push('captcha');
  } catch {
    // ignore
  }

  return blockers;
}

export class InspectPageSkill {
  async inspect(options: InspectPageOptions): Promise<InspectPageResponse> {
    if (!options.url) throw new Error('InspectPageOptions.url is required');

    const page = await browserManager.getPage();
    const waitUntil: LoadState = (options.waitUntil ?? 'domcontentloaded') as LoadState;
    const timeout = Math.max(1000, options.timeout ?? 60000);
    const includeHtml = options.includeHtml ?? true;
    const includeAccessibility = options.includeAccessibility ?? true;
    const includeElements = options.includeElements ?? true;
    const maxElements = Math.max(50, options.maxElements ?? 500);
    const captureFullPage = options.captureFullPage ?? true;
    const pauseForHuman = !!options.pauseForHuman;
    const pauseTimeoutMs = options.pauseTimeoutMs;

    const trace = createTraceWriter(options.tracePath, options.traceAppend);
    trace({ event: 'inspect.start', url: options.url });

    await page.goto(options.url, { waitUntil, timeout });
    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout });
    } else {
      await page.waitForSelector('body', { timeout });
    }

    const title = await page.title().catch(() => '');
    const currentUrl = page.url();

    const base =
      options.capturePrefix && String(options.capturePrefix).trim()
        ? `${String(options.capturePrefix).trim()}_${Date.now()}`
        : path.resolve(process.cwd(), 'artifacts', `inspect-${Date.now()}`);

    const response: InspectPageResponse = {
      url: currentUrl,
      title,
    };

    // Try to focus the tab so the user can interact.
    try {
      await page.bringToFront();
    } catch {
      // ignore
    }

    // Screenshot (what a human sees)
    const screenshotPath = `${base}_screenshot.png`;
    try {
      ensureDirForFile(screenshotPath);
      await page.screenshot({ path: screenshotPath, fullPage: !!captureFullPage });
      response.screenshotPath = screenshotPath;
      trace({ event: 'inspect.screenshot', url: currentUrl, screenshotPath });
    } catch (error) {
      trace({ event: 'inspect.screenshot.error', error: (error as Error)?.message ?? String(error) });
    }

    // Page code snapshot (what automation runs on)
    if (includeHtml) {
      const htmlPath = `${base}_page.html`;
      try {
        ensureDirForFile(htmlPath);
        const html = await page.content();
        fs.writeFileSync(htmlPath, html, 'utf-8');
        response.htmlPath = htmlPath;
        trace({ event: 'inspect.html', url: currentUrl, htmlPath });
      } catch (error) {
        trace({ event: 'inspect.html.error', error: (error as Error)?.message ?? String(error) });
      }
    }

    // ARIA snapshot (often easier for LLMs to reason about than raw HTML)
    if (includeAccessibility) {
      const accessibilityPath = `${base}_a11y.aria.yml`;
      try {
        ensureDirForFile(accessibilityPath);
        const snap = await page.locator('body').ariaSnapshot({ timeout });
        fs.writeFileSync(accessibilityPath, snap + '\n', 'utf-8');
        response.accessibilityPath = accessibilityPath;
        trace({ event: 'inspect.a11y', url: currentUrl, accessibilityPath });
      } catch (error) {
        trace({ event: 'inspect.a11y.error', error: (error as Error)?.message ?? String(error) });
      }
    }

    // UI map (bridge between screenshot and DOM)
    if (includeElements) {
      const elementsPath = `${base}_elements.json`;
      try {
        ensureDirForFile(elementsPath);
        const elements = await extractElements(maxElements);
        response.elementCount = elements.length;
        fs.writeFileSync(elementsPath, JSON.stringify({ url: currentUrl, title, elements }, null, 2) + '\n', 'utf-8');
        response.elementsPath = elementsPath;
        trace({ event: 'inspect.elements', url: currentUrl, elementsPath, elementCount: elements.length });
      } catch (error) {
        trace({ event: 'inspect.elements.error', error: (error as Error)?.message ?? String(error) });
      }
    }

    if (options.detectBlockers ?? true) {
      const blockers = await detectBlockers();
      if (blockers.length) {
        response.blocked = true;
        response.blockers = blockers;
        trace({ event: 'inspect.blocked', url: currentUrl, blockers });
      }
    }

    if (pauseForHuman) {
      response.paused = true;
      const msg =
        options.pauseMessage ??
        'Paused for human action. Finish操作(登录/验证码/点击等)后，回到终端按 Enter 继续...';
      trace({ event: 'inspect.pause.start', url: currentUrl, message: msg, timeoutMs: pauseTimeoutMs ?? 0 });
      await waitForHuman(msg, pauseTimeoutMs);
      trace({ event: 'inspect.pause.end', url: currentUrl });

      // Capture again after human interaction.
      const afterBase = `${base}_after`;

      const afterScreenshotPath = `${afterBase}_screenshot.png`;
      try {
        ensureDirForFile(afterScreenshotPath);
        await page.screenshot({ path: afterScreenshotPath, fullPage: !!captureFullPage });
        response.afterScreenshotPath = afterScreenshotPath;
        trace({ event: 'inspect.after.screenshot', url: currentUrl, screenshotPath: afterScreenshotPath });
      } catch (error) {
        trace({ event: 'inspect.after.screenshot.error', error: (error as Error)?.message ?? String(error) });
      }

      if (includeHtml) {
        const afterHtmlPath = `${afterBase}_page.html`;
        try {
          ensureDirForFile(afterHtmlPath);
          const html = await page.content();
          fs.writeFileSync(afterHtmlPath, html, 'utf-8');
          response.afterHtmlPath = afterHtmlPath;
          trace({ event: 'inspect.after.html', url: currentUrl, htmlPath: afterHtmlPath });
        } catch (error) {
          trace({ event: 'inspect.after.html.error', error: (error as Error)?.message ?? String(error) });
        }
      }

      if (includeAccessibility) {
        const afterAccessibilityPath = `${afterBase}_a11y.aria.yml`;
        try {
          ensureDirForFile(afterAccessibilityPath);
          const snap = await page.locator('body').ariaSnapshot({ timeout });
          fs.writeFileSync(afterAccessibilityPath, snap + '\n', 'utf-8');
          response.afterAccessibilityPath = afterAccessibilityPath;
          trace({ event: 'inspect.after.a11y', url: currentUrl, accessibilityPath: afterAccessibilityPath });
        } catch (error) {
          trace({ event: 'inspect.after.a11y.error', error: (error as Error)?.message ?? String(error) });
        }
      }

      if (includeElements) {
        const afterElementsPath = `${afterBase}_elements.json`;
        try {
          ensureDirForFile(afterElementsPath);
          const elements = await extractElements(maxElements);
          response.afterElementCount = elements.length;
          fs.writeFileSync(
            afterElementsPath,
            JSON.stringify({ url: currentUrl, title, elements }, null, 2) + '\n',
            'utf-8'
          );
          response.afterElementsPath = afterElementsPath;
          trace({ event: 'inspect.after.elements', url: currentUrl, elementsPath: afterElementsPath, elementCount: elements.length });
        } catch (error) {
          trace({ event: 'inspect.after.elements.error', error: (error as Error)?.message ?? String(error) });
        }
      }

      if (options.detectBlockers ?? true) {
        const blockers = await detectBlockers();
        if (blockers.length) {
          response.blocked = true;
          response.blockers = blockers;
          trace({ event: 'inspect.after.blocked', url: currentUrl, blockers });
        } else {
          response.blocked = false;
          response.blockers = [];
        }
      }
    }

    trace({ event: 'inspect.end', url: currentUrl, blocked: !!response.blocked });
    return response;
  }
}

export const inspectPageSkill = new InspectPageSkill();
