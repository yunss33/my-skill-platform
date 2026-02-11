# RPASkill - Web Page Manipulation

A powerful RPA (Robotic Process Automation) skill for manipulating web pages, built with TypeScript and Playwright.

## Features

### Core Functionality
- **Browser Management**: Initialize, control, and close browser instances
- **Web Navigation**: Open URLs, navigate history, handle page loads
- **Element Operations**: Click, type, select, hover, drag-and-drop
- **Data Extraction**: Extract text, attributes, tables, images, and more
- **Flow Control**: Retry mechanisms, conditionals, loops, timeouts
- **Adaptive Search**: Auto-select search goal and run multi-round queries with audit logs
- **Utilities**: Configuration management, logging, helper functions

### Technical Highlights
- **TypeScript**: Strongly typed for better code quality
- **Playwright**: Modern browser automation with cross-browser support
- **Modular Design**: Clean, maintainable code structure
- **Extensible**: Easy to add new features and integrations
- **Configurable**: Environment variables and runtime options

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd RPASkill

# Install dependencies
npm install

# Install Playwright browsers (repo-local)
npm run pw:install

# Build the project
npm run build
```

## Architecture

See `docs/ARCHITECTURE.md` for the “brain partitions” (RPA framework vs. search vs. Codex skills) layout.

## Quick Start

```typescript
import RPASkill from './src/index';

async function run() {
  const rpa = new RPASkill();
  
  // Initialize browser
  await rpa.initBrowser({
    headless: false,
    viewport: {
      width: 1920,
      height: 1080,
    },
  });
  
  // Navigate to a website
  await rpa.navigate('https://example.com');
  
  // Extract data
  const title = await rpa.getTitle();
  console.log(`Page title: ${title}`);
  
  // Close browser
  await rpa.closeBrowser();
}

run();
```

## Examples

Check out the `examples` directory for more detailed examples:

- **basic-navigation.ts**: Basic browser navigation and page interactions
- **element-operation.ts**: Element clicking, typing, and form submission
- **data-extraction.ts**: Extracting text, links, tables, and other data
- **adaptive-search.ts**: Multi-round search with auto goal selection
- **run-adaptive-search.ts / .js**: CLI-driven adaptive search (no code changes)

Run examples with:

```bash
npx ts-node examples/basic-navigation.ts
```

Run adaptive search via CLI:

```bash
npm run adaptive -- --query "AI 多智能体 协作" --goal technical --logEnabled true --channel chrome
```

Or use a JSON config:

```bash
npm run adaptive -- --config configs/search.json
```

## API Reference

### Browser Management
- `initBrowser(options?: BrowserOptions)`: Initialize a browser instance
- `closeBrowser()`: Close the browser instance
- `newPage()`: Create a new browser page
- `isBrowserInitialized()`: Check if browser is initialized

### Navigation
- `navigate(url: string, options?: NavigationOptions)`: Navigate to a URL
- `waitForLoadState(state?: LoadState, timeout?: number)`: Wait for page to load
- `goBack(timeout?: number)`: Go back in browser history
- `goForward(timeout?: number)`: Go forward in browser history
- `refresh(timeout?: number)`: Refresh the current page
- `getUrl()`: Get current page URL
- `getTitle()`: Get current page title
- `waitForNavigation(options?: NavigationOptions)`: Wait for navigation to complete
- `waitForURL(url: string | RegExp, options?: NavigationOptions)`: Wait for specific URL

### Element Operations
- `click(selector: string, options?: ElementOptions)`: Click an element
- `rightClick(selector: string, options?: ElementOptions)`: Right-click an element
- `doubleClick(selector: string, options?: ElementOptions)`: Double-click an element
- `input(selector: string, text: string, options?: ElementOptions)`: Fill an input field
- `type(selector: string, text: string, options?: ElementOptions & { delay?: number })`: Type text with optional delay
- `press(key: string, options?: { delay?: number })`: Press a keyboard key
- `selectOption(selector: string, value: string | number | boolean, options?: ElementOptions)`: Select an option from a dropdown
- `check(selector: string, options?: ElementOptions)`: Check a checkbox
- `uncheck(selector: string, options?: ElementOptions)`: Uncheck a checkbox
- `hover(selector: string, options?: ElementOptions)`: Hover over an element
- `dragAndDrop(source: string, target: string, options?: ElementOptions)`: Drag and drop elements
- `waitForSelector(selector: string, options?: ElementOptions)`: Wait for an element to appear
- `waitForElementVisible(selector: string, timeout?: number)`: Wait for an element to be visible
- `waitForElementHidden(selector: string, timeout?: number)`: Wait for an element to be hidden
- `focus(selector: string, options?: ElementOptions)`: Focus on an element
- `blur(selector: string, options?: ElementOptions)`: Blur an element

### Data Extraction
- `extractText(selector: string, options?: ExtractOptions)`: Extract text from an element
- `extractAllText(selector: string, options?: ExtractOptions)`: Extract text from multiple elements
- `extractAttribute(selector: string, attribute: string, options?: ExtractOptions)`: Extract an attribute value
- `extractAllAttributes(selector: string, attribute: string, options?: ExtractOptions)`: Extract attribute values from multiple elements
- `extractTable(selector: string, options?: ExtractOptions)`: Extract table data as an array of objects
- `extractImage(selector: string, options?: ExtractOptions)`: Extract image URL
- `extractAllImages(selector: string, options?: ExtractOptions)`: Extract image URLs from multiple elements
- `extractPageSource()`: Extract full page HTML
- `extractTitle()`: Extract page title
- `extractUrl()`: Extract current URL
- `extractCookies()`: Extract browser cookies
- `extractLocalStorage()`: Extract localStorage data
- `extractSessionStorage()`: Extract sessionStorage data

### Flow Control
- `wait(milliseconds: number)`: Wait for a specified time
- `retry<T>(action: () => Promise<T>, options?: FlowControlOptions)`: Retry an action with exponential backoff
- `waitForCondition(condition: () => Promise<boolean>, options?: FlowControlOptions)`: Wait for a condition to be true
- `executeInSequence<T>(actions: Array<() => Promise<T>>)`: Execute actions sequentially
- `executeInParallel<T>(actions: Array<() => Promise<T>>)`: Execute actions in parallel
- `ifElse<T>(condition: () => Promise<boolean>, ifAction: () => Promise<T>, elseAction: () => Promise<T>)`: Conditional execution
- `whileLoop(action: () => Promise<boolean>, condition: () => Promise<boolean>, options?: { maxIterations?: number; interval?: number })`: While loop
- `forLoop<T>(items: T[], action: (item: T, index: number) => Promise<void>, options?: { interval?: number })`: For loop
- `withTimeout<T>(action: () => Promise<T>, timeout: number)`: Execute with timeout
- `captureScreenshot(path: string)`: Capture page screenshot
- `recordVideo(path: string, action: () => Promise<void>)`: Record page interaction
- `log(message: string, level?: 'info' | 'warn' | 'error')`: Log messages
- `handleError<T>(action: () => Promise<T>, errorHandler: (error: Error) => Promise<T>)`: Handle errors gracefully

### Adaptive Search
- `adaptiveSearch(options: AdaptiveSearchOptions)`: Auto-select goal, run multi-round search, and return best round + logs

### Utilities
- `getConfig()`: Get configuration manager
- `getLogger()`: Get logger instance
- `getHelper()`: Get helper functions

## Configuration

### Environment Variables
- `BROWSER_HEADLESS`: Set to 'true' for headless mode
- `BROWSER_SLOWMO`: Set delay between operations (milliseconds)
- `BROWSER_TIMEOUT`: Set default browser timeout (milliseconds)
- `NAVIGATION_TIMEOUT`: Set default navigation timeout (milliseconds)
- `NAVIGATION_WAIT_UNTIL`: Set default wait condition ('load', 'domcontentloaded', 'networkidle')

### Runtime Options
All methods accept optional configuration objects for fine-tuning behavior. See the TypeScript types for details.

### Adaptive Search Logging
Adaptive search supports structured audit logs per run and per round:

- `logEnabled`: Enable log output (default: true in CLI)
- `logPath`: Custom output file path
- `logFormat`: `json` or `jsonl`
- `logFlushEachRound`: Write a JSONL entry after each round
- `logIncludeResults`: Include top results in logs
- `logIncludeOpened`: Include opened summaries in logs

## Best Practices

1. **Always close the browser**: Use try/finally to ensure the browser is closed
2. **Handle timeouts**: Use appropriate timeouts for different operations
3. **Wait for elements**: Always wait for elements to be visible before interacting
4. **Use retries**: Implement retry logic for flaky operations
5. **Respect websites**: Follow robots.txt and avoid excessive requests
6. **Capture screenshots**: Use screenshots for debugging and documentation
7. **Log operations**: Keep logs for audit and debugging

## Troubleshooting

### Common Issues
- **Element not found**: Ensure the selector is correct and wait for the element to appear
- **Timeout errors**: Increase timeouts for slow-loading pages
- **Browser crashes**: Check browser version compatibility and system resources
- **Captcha challenges**: Implement human intervention or use anti-captcha services

### Debugging Tips
- **Enable headful mode**: Set `headless: false` to see what's happening
- **Add delays**: Use `slowMo` option to slow down operations

### Pacing (anti-bot)

If a site rate-limits or shows verification pages, use pacing + artifact capture in `searchOnSite`:

- `stepDelayMs` / `stepDelayJitterMs`: add delays between major actions
- `typeDelayMs` / `typeDelayJitterMs`: type like a human (per-character delay)
- `capturePrefix` + `includeHtml/includeElements` + `captureOnBlocked/captureOnDone`: capture screenshot + DOM for AI debugging

See `PACING_GUIDE.md` for recommended presets.
- **Take screenshots**: Capture screenshots at key points
- **Check logs**: Review console logs for errors and warnings

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

ISC License

## Acknowledgements

- [Playwright](https://playwright.dev/) - Modern browser automation
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript
- [Vite](https://vitejs.dev/) - Build tool

## Contact

For questions or support, please open an issue in the repository.
