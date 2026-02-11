export interface BrowserOptions {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
  channel?: 'chrome' | 'msedge' | 'chromium' | 'chrome-beta' | 'msedge-beta';
  executablePath?: string;
  // When set, uses a persistent browser profile directory so login/session can survive across runs.
  // This is Playwright's userDataDir (not the system browser profile).
  userDataDir?: string;
  // Load an existing browser storageState (cookies/localStorage) into the context.
  // This is Playwright's "storageState" JSON file (not the system browser profile).
  storageStatePath?: string;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  args?: string[];
  // When set to null, disables the default viewport (useful with --start-maximized).
  viewport?:
    | {
        width: number;
        height: number;
      }
    | null;
}

export interface ElementOptions {
  timeout?: number;
  force?: boolean;
  noWaitAfter?: boolean;
}

export interface NavigationOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ExtractOptions {
  timeout?: number;
}

export interface FlowControlOptions {
  retries?: number;
  retryInterval?: number;
  timeout?: number;
}

export interface ListExtractionField {
  selector: string;
  attr?: 'text' | 'html' | string;
  trim?: boolean;
}

export interface ListExtractionProfile {
  itemSelector: string;
  fields: Record<string, ListExtractionField>;
}

export interface ListExtractionOptions {
  limit?: number;
  baseUrl?: string;
}

export type SearchTaskOptions =
  | {
      // Directly open a pre-built search URL and extract list from it.
      searchUrl: string;
      url?: never;
      query?: string;
      searchInput?: never;
      searchButton?: never;
      submitByEnter?: never;
      resultsWaitFor?: string;
      waitForLoadState?: LoadState;
      inputTimeout?: number;
      resultsTimeout?: number;
      beforeSearchDelayMs?: number;
      afterSearchDelayMs?: number;
      cookieAcceptSelector?: string;
      // Human-in-the-loop: allow manual verification/login/captcha before continuing.
      pauseForHuman?: boolean;
      // How to resume when blocked:
      // - auto: keep polling for resultsWaitFor to appear
      // - enter: ask the user to press Enter after completing verification
      pauseForHumanMode?: 'auto' | 'enter';
      pauseMessage?: string;
      pauseTimeoutMs?: number;

      // Pace controls (best-effort). Useful to avoid triggering anti-bot systems.
      // - stepDelayMs adds a delay between major actions (navigation, click, type, etc.)
      // - jitter adds randomness on top of the base delay
      stepDelayMs?: number;
      stepDelayJitterMs?: number;
      // When using UI search (searchInput), type with a per-character delay.
      typeDelayMs?: number;
      typeDelayJitterMs?: number;

      // Optional trace log (JSONL). Lets the platform index screenshots/HTML/UI-map artifacts.
      tracePath?: string;
      traceAppend?: boolean;

      // Optional capture artifacts (screenshot + html + elements) while running searchOnSite.
      // This is a lightweight "inspect" that does NOT navigate; it captures the current page.
      capturePrefix?: string;
      captureFullPage?: boolean;
      includeHtml?: boolean;
      includeElements?: boolean;
      maxElements?: number;
      captureOnBlocked?: boolean;
      captureOnDone?: boolean;
      // Best-effort detection for common blockers like login/captcha pages.
      detectBlockers?: boolean;

      list: ListExtractionProfile;
      limit?: number;
      baseUrl?: string;
      screenshotPath?: string;
      navigationTimeout?: number;
      navigationWaitUntil?: LoadState;
    }
  | {
      // Use the site search UI (input + click/enter), then extract list.
      searchUrl?: never;
      url?: string;
      query: string;
      searchInput: string;
      searchButton?: string;
      submitByEnter?: boolean;
      resultsWaitFor?: string;
      waitForLoadState?: LoadState;
      inputTimeout?: number;
      resultsTimeout?: number;
      beforeSearchDelayMs?: number;
      afterSearchDelayMs?: number;
      cookieAcceptSelector?: string;
      // Human-in-the-loop: allow manual verification/login/captcha before continuing.
      pauseForHuman?: boolean;
      // How to resume when blocked:
      // - auto: keep polling for resultsWaitFor to appear
      // - enter: ask the user to press Enter after completing verification
      pauseForHumanMode?: 'auto' | 'enter';
      pauseMessage?: string;
      pauseTimeoutMs?: number;

      // Pace controls (best-effort). Useful to avoid triggering anti-bot systems.
      stepDelayMs?: number;
      stepDelayJitterMs?: number;
      typeDelayMs?: number;
      typeDelayJitterMs?: number;

      // Optional trace log (JSONL).
      tracePath?: string;
      traceAppend?: boolean;

      // Optional capture artifacts (screenshot + html + elements).
      capturePrefix?: string;
      captureFullPage?: boolean;
      includeHtml?: boolean;
      includeElements?: boolean;
      maxElements?: number;
      captureOnBlocked?: boolean;
      captureOnDone?: boolean;
      detectBlockers?: boolean;

      list: ListExtractionProfile;
      limit?: number;
      baseUrl?: string;
      screenshotPath?: string;
      navigationTimeout?: number;
      navigationWaitUntil?: LoadState;
    };

export type WebSearchEngine = 'bing' | 'baike' | 'baidu';

export type SearchGoal = 'auto' | 'popular' | 'academic' | 'shopping' | 'technical';

export interface WebSearchOptions {
  engine?: WebSearchEngine;
  query?: string;
  pages?: number;
  perPage?: number;
  details?: number;
  preferredDomains?: string[];
  keywords?: string[] | string;
  screenshotPrefix?: string;
  // Save screenshots when opening detail pages (details > 0).
  openScreenshotPrefix?: string;
  openScreenshotFullPage?: boolean;
  // Append-only trace log (JSONL). Useful for AI to reconstruct "what happened" and locate screenshots.
  tracePath?: string;
  traceAppend?: boolean;
  afterSearchDelayMs?: number;
  navigationTimeout?: number;
  baikeUrl?: string;
}

export interface WebSearchResult {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchOpened {
  title: string;
  url: string;
  summary: string;
}

export interface WebSearchResponse {
  engine: WebSearchEngine;
  query?: string;
  results: WebSearchResult[];
  opened: WebSearchOpened[];
  fallbackUsed?: boolean;
}

export interface AdaptiveSearchOptions {
  query: string;
  goal?: SearchGoal;
  language?: 'auto' | 'zh' | 'en';
  engine?: WebSearchEngine;
  pages?: number;
  perPage?: number;
  details?: number;
  preferredDomains?: string[];
  keywords?: string[] | string;
  strictKeywords?: boolean;
  minResults?: number;
  maxRounds?: number;
  logPath?: string;
  logEnabled?: boolean;
  logFormat?: 'json' | 'jsonl';
  logAppend?: boolean;
  logFlushEachRound?: boolean;
  logIncludeResults?: boolean;
  logIncludeOpened?: boolean;
  logIncludeSnippets?: boolean;
  logMaxResults?: number;
  logMaxOpened?: number;
  screenshotPrefix?: string;
  openScreenshotPrefix?: string;
  openScreenshotFullPage?: boolean;
  tracePath?: string;
  traceAppend?: boolean;
  afterSearchDelayMs?: number;
  navigationTimeout?: number;
  baikeUrl?: string;
}

export interface StructureFeatures {
  // Basic features
  itemCount: number;
  hasTitles: boolean;
  hasSnippets: boolean;
  hasUrls: boolean;
  
  // Semantic features
  titleLengths: number[];
  snippetLengths: number[];
  averageTitleLength: number;
  averageSnippetLength: number;
  
  // Keyword features
  keywordDensity: number;
  keywordDistribution: Record<string, number>;
  
  // Domain features
  domainDistribution: Record<string, number>;
  uniqueDomains: number;
  topDomain: string;
  
  // Quality features
  duplicateTitles: number;
  emptyFields: number;
  
  // Format features
  hasNumbers: boolean;
  hasDates: boolean;
  hasUrlsInSnippets: boolean;
}

export interface ResultStructure {
  type: 'list' | 'table' | 'mixed' | 'none';
  itemCount: number;
  hasTitles: boolean;
  hasSnippets: boolean;
  hasUrls: boolean;
  domainDistribution: Record<string, number>;
  relevanceScore: number;
  structuralScore: number;
  features?: StructureFeatures;
}

export interface StructureAnalysis {
  structure: ResultStructure;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  confidence: number;
}

export interface AdaptiveSearchRound {
  query: string;
  goal: SearchGoal;
  engine: WebSearchEngine;
  preferredDomains: string[];
  keywordHints: string[];
  hits: number;
  score: number;
  matchedKeywords?: string[];
  topTitles?: string[];
  notes?: string[];
  resultCount?: number;
  error?: string;
  roundIndex?: number;
  expandedQuery?: boolean;
  continueReason?: string;
  response: WebSearchResponse;
  structureAnalysis?: StructureAnalysis;
  thoughtProcess?: string[];
}

export interface SearchTrends {
  scoreTrend: 'improving' | 'declining' | 'stable';
  relevanceTrend: 'improving' | 'declining' | 'stable';
  structureTrend: 'improving' | 'declining' | 'stable';
  itemCountTrend: 'improving' | 'declining' | 'stable';
  improvementRate: number;
  bestImprovementArea: string;
}

export interface AdaptiveSearchResponse {
  goal: SearchGoal;
  language: 'zh' | 'en';
  rounds: AdaptiveSearchRound[];
  best: AdaptiveSearchRound | null;
  bestRoundIndex?: number;
  decisionReason?: string;
  stopReason?: string;
  logPath?: string;
  logFormat?: 'json' | 'jsonl';
  logFlushEachRound?: boolean;
  trends?: SearchTrends;
  progressiveOptimizations?: string[];
}

export interface InspectPageOptions {
  url: string;
  waitUntil?: LoadState;
  waitForSelector?: string;
  timeout?: number;
  // Capture file prefix (without extension). The skill will append suffixes.
  capturePrefix?: string;
  captureFullPage?: boolean;
  includeHtml?: boolean;
  includeAccessibility?: boolean;
  includeElements?: boolean;
  maxElements?: number;
  tracePath?: string;
  traceAppend?: boolean;
  // Best-effort detection for common blockers like login/captcha pages.
  detectBlockers?: boolean;
  // Human-in-the-loop: keep the browser open and wait for a person to finish actions (login/captcha/etc).
  pauseForHuman?: boolean;
  pauseMessage?: string;
  // Optional safety timeout; 0/undefined means "wait forever".
  pauseTimeoutMs?: number;
}

export interface InspectPageElement {
  index: number;
  tag: string;
  text?: string;
  role?: string;
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  selectorHints?: string[];
  bbox?: { x: number; y: number; width: number; height: number; cx: number; cy: number };
}

export interface InspectPageResponse {
  url: string;
  title?: string;
  screenshotPath?: string;
  htmlPath?: string;
  accessibilityPath?: string;
  elementsPath?: string;
  elementCount?: number;
  blocked?: boolean;
  blockers?: string[];
  paused?: boolean;
  afterScreenshotPath?: string;
  afterHtmlPath?: string;
  afterAccessibilityPath?: string;
  afterElementsPath?: string;
  afterElementCount?: number;
}

export interface SearchResultRecord {
  [key: string]: string | number;
}

export type LoadState = 'load' | 'domcontentloaded' | 'networkidle';

export interface TableData {
  [key: string]: string;
}
