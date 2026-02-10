import { browserManager } from './core/browser.js';
import { navigator } from './core/navigator.js';
import { elementOperator } from './core/element.js';
import { extractor } from './core/extractor.js';
import { flowController } from './core/flow.js';
import { searchSkill } from './skills/search.js';
import { webSearchSkill } from './skills/webSearch.js';
import { adaptiveSearchSkill } from './skills/adaptiveSearch.js';
import { inspectPageSkill } from './skills/inspectPage.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { helper } from './utils/helper.js';
import {
  AdaptiveSearchOptions,
  AdaptiveSearchResponse,
  AdaptiveSearchRound,
  BrowserOptions,
  ElementOptions,
  ExtractOptions,
  FlowControlOptions,
  InspectPageOptions,
  InspectPageResponse,
  ListExtractionOptions,
  ListExtractionProfile,
  LoadState,
  NavigationOptions,
  SearchGoal,
  SearchResultRecord,
  SearchTaskOptions,
  TableData,
  WebSearchEngine,
  WebSearchOpened,
  WebSearchOptions,
  WebSearchResponse,
  WebSearchResult,
} from './types.js';

export class RPASkill {
  // Browser Management
  async initBrowser(options: BrowserOptions = {}): Promise<void> {
    await browserManager.initBrowser(options);
  }

  async closeBrowser(): Promise<void> {
    await browserManager.closeBrowser();
  }

  async newPage(): Promise<void> {
    await browserManager.newPage();
  }

  isBrowserInitialized(): boolean {
    return browserManager.isInitialized();
  }

  // Navigation
  async navigate(url: string, options: NavigationOptions = {}): Promise<void> {
    await navigator.navigate(url, options);
  }

  async waitForLoadState(state: LoadState = 'networkidle', timeout?: number): Promise<void> {
    await navigator.waitForLoadState(state, timeout);
  }

  async goBack(timeout?: number): Promise<void> {
    await navigator.goBack(timeout);
  }

  async goForward(timeout?: number): Promise<void> {
    await navigator.goForward(timeout);
  }

  async refresh(timeout?: number): Promise<void> {
    await navigator.refresh(timeout);
  }

  async getUrl(): Promise<string> {
    return await navigator.getUrl();
  }

  async getTitle(): Promise<string> {
    return await navigator.getTitle();
  }

  async waitForNavigation(options: NavigationOptions = {}): Promise<void> {
    await navigator.waitForNavigation(options);
  }

  async waitForURL(url: string | RegExp, options: NavigationOptions = {}): Promise<void> {
    await navigator.waitForURL(url, options);
  }

  // Element Operations
  async click(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.click(selector, options);
  }

  async rightClick(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.rightClick(selector, options);
  }

  async doubleClick(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.doubleClick(selector, options);
  }

  async input(selector: string, text: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.input(selector, text, options);
  }

  async type(selector: string, text: string, options: ElementOptions & { delay?: number } = {}): Promise<void> {
    await elementOperator.type(selector, text, options);
  }

  async press(key: string, options: { delay?: number } = {}): Promise<void> {
    await elementOperator.press(key, options);
  }

  async selectOption(selector: string, value: string | number | boolean, options: ElementOptions = {}): Promise<void> {
    await elementOperator.selectOption(selector, value, options);
  }

  async check(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.check(selector, options);
  }

  async uncheck(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.uncheck(selector, options);
  }

  async hover(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.hover(selector, options);
  }

  async dragAndDrop(source: string, target: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.dragAndDrop(source, target, options);
  }

  async waitForSelector(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.waitForSelector(selector, options);
  }

  async waitForElementVisible(selector: string, timeout?: number): Promise<void> {
    await elementOperator.waitForElementVisible(selector, timeout);
  }

  async waitForElementHidden(selector: string, timeout?: number): Promise<void> {
    await elementOperator.waitForElementHidden(selector, timeout);
  }

  async focus(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.focus(selector, options);
  }

  async blur(selector: string, options: ElementOptions = {}): Promise<void> {
    await elementOperator.blur(selector, options);
  }

  // Data Extraction
  async extractText(selector: string, options: ExtractOptions = {}): Promise<string> {
    return await extractor.extractText(selector, options);
  }

  async extractAllText(selector: string, options: ExtractOptions = {}): Promise<string[]> {
    return await extractor.extractAllText(selector, options);
  }

  async extractAttribute(selector: string, attribute: string, options: ExtractOptions = {}): Promise<string> {
    return await extractor.extractAttribute(selector, attribute, options);
  }

  async extractAllAttributes(selector: string, attribute: string, options: ExtractOptions = {}): Promise<string[]> {
    return await extractor.extractAllAttributes(selector, attribute, options);
  }

  async extractTable(selector: string, options: ExtractOptions = {}): Promise<TableData[]> {
    return await extractor.extractTable(selector, options);
  }

  async extractImage(selector: string, options: ExtractOptions = {}): Promise<string> {
    return await extractor.extractImage(selector, options);
  }

  async extractAllImages(selector: string, options: ExtractOptions = {}): Promise<string[]> {
    return await extractor.extractAllImages(selector, options);
  }

  async extractPageSource(): Promise<string> {
    return await extractor.extractPageSource();
  }

  async extractTitle(): Promise<string> {
    return await extractor.extractTitle();
  }

  async extractUrl(): Promise<string> {
    return await extractor.extractUrl();
  }

  async extractCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: string }>> {
    return await extractor.extractCookies();
  }

  async extractLocalStorage(): Promise<Record<string, string>> {
    return await extractor.extractLocalStorage();
  }

  async extractSessionStorage(): Promise<Record<string, string>> {
    return await extractor.extractSessionStorage();
  }

  // Session persistence (cookies/localStorage)
  async saveStorageState(storageStatePath: string): Promise<string> {
    const ctx = await browserManager.getContext();
    await ctx.storageState({ path: storageStatePath });
    return storageStatePath;
  }

  // Flow Control
  async wait(milliseconds: number): Promise<void> {
    await flowController.wait(milliseconds);
  }

  async retry<T>(action: () => Promise<T>, options: FlowControlOptions = {}): Promise<T> {
    return await flowController.retry(action, options);
  }

  async waitForCondition(condition: () => Promise<boolean>, options: FlowControlOptions = {}): Promise<void> {
    await flowController.waitForCondition(condition, options);
  }

  async executeInSequence<T>(actions: Array<() => Promise<T>>): Promise<T[]> {
    return await flowController.executeInSequence(actions);
  }

  async executeInParallel<T>(actions: Array<() => Promise<T>>): Promise<T[]> {
    return await flowController.executeInParallel(actions);
  }

  async ifElse<T>(condition: () => Promise<boolean>, ifAction: () => Promise<T>, elseAction: () => Promise<T>): Promise<T> {
    return await flowController.ifElse(condition, ifAction, elseAction);
  }

  async whileLoop(action: () => Promise<boolean>, condition: () => Promise<boolean>, options: { maxIterations?: number; interval?: number } = {}): Promise<void> {
    await flowController.whileLoop(action, condition, options);
  }

  async forLoop<T>(items: T[], action: (item: T, index: number) => Promise<void>, options: { interval?: number } = {}): Promise<void> {
    await flowController.forLoop(items, action, options);
  }

  async withTimeout<T>(action: () => Promise<T>, timeout: number): Promise<T> {
    return await flowController.withTimeout(action, timeout);
  }

  async captureScreenshot(path: string): Promise<void> {
    await flowController.captureScreenshot(path);
  }

  async recordVideo(path: string, action: () => Promise<void>): Promise<void> {
    await flowController.recordVideo(path, action);
  }

  async log(message: string, level: 'info' | 'warn' | 'error' = 'info'): Promise<void> {
    await flowController.log(message, level);
  }

  async handleError<T>(action: () => Promise<T>, errorHandler: (error: Error) => Promise<T>): Promise<T> {
    return await flowController.handleError(action, errorHandler);
  }

  // Search & List Extraction
  async extractList(profile: ListExtractionProfile, options: ListExtractionOptions = {}): Promise<SearchResultRecord[]> {
    return await searchSkill.extractList(profile, options);
  }

  async searchOnSite(options: SearchTaskOptions): Promise<SearchResultRecord[]> {
    return await searchSkill.searchOnSite(options);
  }

  async webSearch(options: WebSearchOptions = {}): Promise<WebSearchResponse> {
    return await webSearchSkill.search(options);
  }

  async adaptiveSearch(options: AdaptiveSearchOptions): Promise<AdaptiveSearchResponse> {
    return await adaptiveSearchSkill.search(options);
  }

  // Inspect (screenshot + html + ui map)
  async inspectPage(options: InspectPageOptions): Promise<InspectPageResponse> {
    return await inspectPageSkill.inspect(options);
  }

  // Utils
  getConfig() {
    return config;
  }

  getLogger() {
    return logger;
  }

  getHelper() {
    return helper;
  }
}

export {
  BrowserOptions,
  NavigationOptions,
  ElementOptions,
  ExtractOptions,
  FlowControlOptions,
  LoadState,
  TableData,
  ListExtractionProfile,
  ListExtractionOptions,
  SearchTaskOptions,
  SearchResultRecord,
  WebSearchOptions,
  WebSearchResponse,
  WebSearchEngine,
  WebSearchOpened,
  WebSearchResult,
  AdaptiveSearchOptions,
  AdaptiveSearchResponse,
  SearchGoal,
  AdaptiveSearchRound,
  InspectPageOptions,
  InspectPageResponse,
};
export default RPASkill;
