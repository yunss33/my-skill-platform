import { BrowserOptions } from '../types.js';

export class Config {
  private static instance: Config;
  private config: Record<string, any>;

  private constructor() {
    this.config = {
      browser: {
        headless: false,
        slowMo: 0,
        timeout: 30000,
        viewport: {
          width: 1920,
          height: 1080,
        },
      },
      navigation: {
        timeout: 30000,
        waitUntil: 'networkidle' as const,
      },
      element: {
        timeout: 30000,
      },
      extraction: {
        timeout: 30000,
      },
      flow: {
        retries: 3,
        retryInterval: 1000,
        timeout: 30000,
      },
    };

    // Load from environment variables
    this.loadFromEnv();
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  private loadFromEnv(): void {
    // Load browser config from env
    if (process.env.BROWSER_HEADLESS) {
      this.config.browser.headless = process.env.BROWSER_HEADLESS === 'true';
    }
    if (process.env.BROWSER_SLOWMO) {
      this.config.browser.slowMo = parseInt(process.env.BROWSER_SLOWMO, 10);
    }
    if (process.env.BROWSER_TIMEOUT) {
      this.config.browser.timeout = parseInt(process.env.BROWSER_TIMEOUT, 10);
    }

    // Load navigation config from env
    if (process.env.NAVIGATION_TIMEOUT) {
      this.config.navigation.timeout = parseInt(process.env.NAVIGATION_TIMEOUT, 10);
    }
    if (process.env.NAVIGATION_WAIT_UNTIL) {
      this.config.navigation.waitUntil = process.env.NAVIGATION_WAIT_UNTIL as 'load' | 'domcontentloaded' | 'networkidle';
    }
  }

  getBrowserConfig(): BrowserOptions {
    return this.config.browser;
  }

  getNavigationConfig(): any {
    return this.config.navigation;
  }

  getElementConfig(): any {
    return this.config.element;
  }

  getExtractionConfig(): any {
    return this.config.extraction;
  }

  getFlowConfig(): any {
    return this.config.flow;
  }

  set(key: string, value: any): void {
    const keys = key.split('.');
    let current = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }

  get(key: string): any {
    const keys = key.split('.');
    let current = this.config;
    for (const k of keys) {
      if (!current[k]) {
        return undefined;
      }
      current = current[k];
    }
    return current;
  }

  merge(config: Record<string, any>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      browser: {
        headless: false,
        slowMo: 0,
        timeout: 30000,
        viewport: {
          width: 1920,
          height: 1080,
        },
      },
      navigation: {
        timeout: 30000,
        waitUntil: 'networkidle' as const,
      },
      element: {
        timeout: 30000,
      },
      extraction: {
        timeout: 30000,
      },
      flow: {
        retries: 3,
        retryInterval: 1000,
        timeout: 30000,
      },
    };
  }
}

export const config = Config.getInstance();
