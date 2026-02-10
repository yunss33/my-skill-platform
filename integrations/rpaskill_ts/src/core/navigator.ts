import { browserManager } from './browser.js';
import { NavigationOptions, LoadState } from '../types.js';

export class Navigator {
  async navigate(url: string, options: NavigationOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const navigationOptions = {
      timeout: options.timeout ?? 30000,
      waitUntil: options.waitUntil ?? 'networkidle',
    };
    await page.goto(url, navigationOptions);
  }

  async waitForLoadState(state: LoadState = 'networkidle', timeout?: number): Promise<void> {
    const page = await browserManager.getPage();
    await page.waitForLoadState(state, { timeout });
  }

  async goBack(timeout?: number): Promise<void> {
    const page = await browserManager.getPage();
    await page.goBack({ timeout });
  }

  async goForward(timeout?: number): Promise<void> {
    const page = await browserManager.getPage();
    await page.goForward({ timeout });
  }

  async refresh(timeout?: number): Promise<void> {
    const page = await browserManager.getPage();
    await page.reload({ timeout });
  }

  async getUrl(): Promise<string> {
    const page = await browserManager.getPage();
    return page.url();
  }

  async getTitle(): Promise<string> {
    const page = await browserManager.getPage();
    return page.title();
  }

  async waitForNavigation(options: NavigationOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const navigationOptions = {
      timeout: options.timeout ?? 30000,
      waitUntil: options.waitUntil ?? 'networkidle',
    };
    await page.waitForNavigation(navigationOptions);
  }

  async waitForURL(url: string | RegExp, options: NavigationOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const navigationOptions = {
      timeout: options.timeout ?? 30000,
      waitUntil: options.waitUntil ?? 'networkidle',
    };
    await page.waitForURL(url, navigationOptions);
  }

  async closePage(): Promise<void> {
    const page = await browserManager.getPage();
    await page.close();
  }

  async newPage(): Promise<void> {
    await browserManager.newPage();
  }
}

export const navigator = new Navigator();
