import { browserManager } from './browser.js';
import { FlowControlOptions } from '../types.js';

export class FlowController {
  async wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }

  async retry<T>(action: () => Promise<T>, options: FlowControlOptions = {}): Promise<T> {
    const { retries = 3, retryInterval = 1000, timeout } = options;
    let lastError: Error = new Error('Operation failed');

    for (let i = 0; i <= retries; i++) {
      try {
        if (timeout) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Operation timed out')), timeout);
          });
          return await Promise.race([action(), timeoutPromise]);
        }
        return await action();
      } catch (error) {
        lastError = error as Error;
        if (i < retries) {
          await this.wait(retryInterval);
        }
      }
    }

    throw lastError;
  }

  async waitForCondition(condition: () => Promise<boolean>, options: FlowControlOptions = {}): Promise<void> {
    const { timeout = 30000, retryInterval = 500 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await this.wait(retryInterval);
    }

    throw new Error('Condition not met within timeout');
  }

  async executeInSequence<T>(actions: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];
    for (const action of actions) {
      const result = await action();
      results.push(result);
    }
    return results;
  }

  async executeInParallel<T>(actions: Array<() => Promise<T>>): Promise<T[]> {
    return await Promise.all(actions.map(action => action()));
  }

  async ifElse<T>(condition: () => Promise<boolean>, ifAction: () => Promise<T>, elseAction: () => Promise<T>): Promise<T> {
    if (await condition()) {
      return await ifAction();
    } else {
      return await elseAction();
    }
  }

  async whileLoop(action: () => Promise<boolean>, condition: () => Promise<boolean>, options: { maxIterations?: number; interval?: number } = {}): Promise<void> {
    const { maxIterations = 100, interval = 0 } = options;
    let iterations = 0;

    while (await condition() && iterations < maxIterations) {
      await action();
      iterations++;
      if (interval > 0) {
        await this.wait(interval);
      }
    }

    if (iterations >= maxIterations) {
      throw new Error('Maximum iterations reached');
    }
  }

  async forLoop<T>(items: T[], action: (item: T, index: number) => Promise<void>, options: { interval?: number } = {}): Promise<void> {
    const { interval = 0 } = options;

    for (let i = 0; i < items.length; i++) {
      await action(items[i], i);
      if (interval > 0 && i < items.length - 1) {
        await this.wait(interval);
      }
    }
  }

  async withTimeout<T>(action: () => Promise<T>, timeout: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), timeout);
    });

    return await Promise.race([action(), timeoutPromise]);
  }

  async captureScreenshot(path: string): Promise<void> {
    const page = await browserManager.getPage();
    await page.screenshot({ path });
  }

  async recordVideo(path: string, action: () => Promise<void>): Promise<void> {
    const context = await browserManager.getContext();
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
    });

    try {
      await action();
    } finally {
      await context.tracing.stop({ path });
    }
  }

  async log(message: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  }

  async handleError<T>(action: () => Promise<T>, errorHandler: (error: Error) => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      return await errorHandler(error as Error);
    }
  }
}

export const flowController = new FlowController();
