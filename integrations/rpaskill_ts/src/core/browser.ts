import path from 'node:path';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { BrowserOptions } from '../types.js';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initBrowser(options: BrowserOptions = {}): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    // Default to a repo-local browsers directory so Playwright doesn't download into the user profile cache.
    // Users can override by setting PLAYWRIGHT_BROWSERS_PATH themselves.
    if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(process.cwd(), '工程依赖', 'Playwright', 'browsers');
    }

    const browserOptions = {
      headless: options.headless ?? false,
      slowMo: options.slowMo ?? 0,
      channel: options.channel,
      executablePath: options.executablePath,
      args: options.args ?? [],
      proxy: options.proxy,
    };

    // If the user asks to start maximized, the default viewport will fight with it.
    // In Playwright, `viewport: null` lets the browser window size drive the viewport.
    const wantsMaximized = (options.args ?? []).some((a) => String(a).toLowerCase().includes('start-maximized'));
    const viewport =
      options.viewport === undefined
        ? wantsMaximized
          ? null
          : { width: 1920, height: 1080 }
        : options.viewport;

    if (options.userDataDir) {
      // Persistent context keeps cookies/localStorage across runs.
      // Note: storageState is ignored for persistent contexts.
      this.context = await chromium.launchPersistentContext(options.userDataDir, {
        ...browserOptions,
        viewport,
      });
      this.browser = this.context.browser();
    } else {
      this.browser = await chromium.launch(browserOptions);
      this.context = await this.browser.newContext({
        viewport,
        storageState: options.storageStatePath,
      });
    }
    this.page = await this.context.newPage();

    if (!this.browser) {
      throw new Error('Browser failed to initialize.');
    }
    return this.browser;
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call initBrowser first.');
    }
    return this.page;
  }

  async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initBrowser first.');
    }
    return this.context;
  }

  async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not initialized. Call initBrowser first.');
    }
    this.page = await this.context.newPage();
    return this.page;
  }

  isInitialized(): boolean {
    return !!this.browser;
  }
}

export const browserManager = new BrowserManager();
