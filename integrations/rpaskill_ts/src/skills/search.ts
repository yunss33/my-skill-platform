import { browserManager } from '../core/browser.js';
import { helper } from '../utils/helper.js';
import { ListExtractionOptions, ListExtractionProfile, SearchResultRecord, SearchTaskOptions } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!dir || dir === '.') return;
  fs.mkdirSync(dir, { recursive: true });
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
  const page = await browserManager.getPage();
  const maxWait = timeoutMs && timeoutMs > 0 ? timeoutMs : 10 * 60 * 1000;
  const deadline = Date.now() + maxWait;

  // Keep trying across navigations while the user solves verification.
  // Use short timeouts per attempt so we can recover from navigation/context resets.
  while (Date.now() < deadline) {
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

    const navigationTimeout = options.navigationTimeout ?? 30000;
    const navigationWaitUntil = options.navigationWaitUntil ?? 'domcontentloaded';

    if (options.searchUrl) {
      await page.goto(options.searchUrl, {
        timeout: navigationTimeout,
        waitUntil: navigationWaitUntil,
      });
    } else if (options.url) {
      await page.goto(options.url, {
        timeout: navigationTimeout,
        waitUntil: navigationWaitUntil,
      });
    }

    // Bring window to front for visible runs so the user can see/interact.
    try {
      await page.bringToFront();
    } catch {
      // ignore
    }

    // If the site immediately redirects to a verification page, pause early.
    if (options.pauseForHuman && (await isLikelyBlocked())) {
      const msg =
        options.pauseMessage ??
        `Page seems blocked (login/captcha/verification).\nCurrent URL: ${page.url()}\nPlease complete it in the browser; the skill will auto-continue when results appear.`;
      // eslint-disable-next-line no-console
      console.log(msg);
    }

    if (options.cookieAcceptSelector) {
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

      await page.fill(options.searchInput, options.query);

      if (options.searchButton) {
        await page.click(options.searchButton);
      } else if (options.submitByEnter ?? true) {
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
        if (options.pauseForHuman || (await isLikelyBlocked())) {
          const msg =
            options.pauseMessage ??
            `Page seems blocked (login/captcha/verification).\nCurrent URL: ${page.url()}\nPlease complete it in the browser; the skill will auto-continue when results appear.`;
          // eslint-disable-next-line no-console
          console.log(msg);

          const ok = await waitUntilSelectorVisible(
            options.resultsWaitFor,
            Math.max(options.pauseTimeoutMs ?? 0, options.resultsTimeout ?? 0, 10 * 60 * 1000)
          );
          if (!ok) {
            throw new Error(`Human-in-the-loop wait timed out. Still cannot find selector: ${options.resultsWaitFor}`);
          }
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
    }

    try {
      return await this.extractList(options.list, {
        limit: options.limit,
        baseUrl: options.baseUrl ?? page.url(),
      });
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
        return await this.extractList(options.list, {
          limit: options.limit,
          baseUrl: options.baseUrl ?? page.url(),
        });
      }
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
