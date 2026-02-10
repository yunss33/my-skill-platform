import { browserManager } from './browser.js';
import { ElementOptions } from '../types.js';

export class ElementOperator {
  async click(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
      force: options.force ?? false,
      noWaitAfter: options.noWaitAfter ?? false,
    };
    await page.click(selector, elementOptions);
  }

  async rightClick(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
      force: options.force ?? false,
      noWaitAfter: options.noWaitAfter ?? false,
    };
    await page.click(selector, { ...elementOptions, button: 'right' });
  }

  async doubleClick(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
      force: options.force ?? false,
      noWaitAfter: options.noWaitAfter ?? false,
    };
    await page.dblclick(selector, elementOptions);
  }

  async input(selector: string, text: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
    };
    await page.fill(selector, text, elementOptions);
  }

  async type(selector: string, text: string, options: ElementOptions & { delay?: number } = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
      delay: options.delay ?? 0,
    };
    await page.type(selector, text, elementOptions);
  }

  async press(key: string, options: { delay?: number } = {}): Promise<void> {
    const page = await browserManager.getPage();
    await page.keyboard.press(key, options);
  }

  async selectOption(selector: string, value: string | number | boolean, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
    };
    await page.selectOption(selector, { value: String(value) }, elementOptions);
  }

  async check(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
      force: options.force ?? false,
    };
    await page.check(selector, elementOptions);
  }

  async uncheck(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
      force: options.force ?? false,
    };
    await page.uncheck(selector, elementOptions);
  }

  async hover(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
    };
    await page.hover(selector, elementOptions);
  }

  async dragAndDrop(source: string, target: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
    };
    await page.dragAndDrop(source, target, elementOptions);
  }

  async waitForSelector(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
    };
    await page.waitForSelector(selector, elementOptions);
  }

  async waitForElementVisible(selector: string, timeout?: number): Promise<void> {
    const page = await browserManager.getPage();
    await page.waitForSelector(selector, { timeout, state: 'visible' });
  }

  async waitForElementHidden(selector: string, timeout?: number): Promise<void> {
    const page = await browserManager.getPage();
    await page.waitForSelector(selector, { timeout, state: 'hidden' });
  }

  async focus(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    const elementOptions = {
      timeout: options.timeout ?? 30000,
    };
    await page.focus(selector, elementOptions);
  }

  async blur(selector: string, options: ElementOptions = {}): Promise<void> {
    const page = await browserManager.getPage();
    await this.focus(selector, options);
    await page.keyboard.press('Tab');
  }
}

export const elementOperator = new ElementOperator();
