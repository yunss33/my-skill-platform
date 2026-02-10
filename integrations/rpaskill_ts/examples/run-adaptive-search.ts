import fs from 'node:fs';
import path from 'node:path';
import RPASkill from '../src/index';

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? next : 'true';
    args[key] = value;
    if (value !== 'true') i += 1;
  }
  return args;
}

function toBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

function toInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readConfig(configPath?: string): Record<string, unknown> {
  if (!configPath) return {};
  const resolved = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(`Usage:
  npm run adaptive -- [options]

Options:
  --query "<text>"           Query string (required if no --config)
  --config <file>            JSON config file path
  --goal auto|popular|academic|shopping|technical
  --language auto|zh|en
  --engine bing|baike
  --pages <n>
  --perPage <n>
  --details <n>
  --minResults <n>
  --maxRounds <n>
  --strictKeywords true|false
  --keywords k1,k2,...
  --logEnabled true|false
  --logPath <file>
  --logFormat json|jsonl
  --logAppend true|false
  --logFlushEachRound true|false
  --logIncludeResults true|false
  --logIncludeOpened true|false
  --logIncludeSnippets true|false
  --logMaxResults <n>
  --logMaxOpened <n>

Examples:
  npm run adaptive -- --query "AI 多智能体 协作" --goal technical --logEnabled true
  npm run adaptive -- --config configs/search.json
`);
    return;
  }

  const config = readConfig(args.config);
  const query = (args.query ?? config.query) as string | undefined;
  if (!query) {
    throw new Error('Missing --query or config.query');
  }

  const rpa = new RPASkill();
  try {
    await rpa.initBrowser({
      headless: toBool((args.headless ?? config.headless) as string | undefined, true),
      channel: (args.channel ?? config.channel) as any,
      viewport: { width: 1440, height: 900 },
    });

    const response = await rpa.adaptiveSearch({
      query,
      goal: (args.goal ?? config.goal) as any,
      language: (args.language ?? config.language) as any,
      engine: (args.engine ?? config.engine) as any,
      pages: toInt((args.pages ?? config.pages) as string | undefined, 2),
      perPage: toInt((args.perPage ?? config.perPage) as string | undefined, 10),
      details: toInt((args.details ?? config.details) as string | undefined, 0),
      minResults: toInt((args.minResults ?? config.minResults) as string | undefined, 5),
      maxRounds: toInt((args.maxRounds ?? config.maxRounds) as string | undefined, 2),
      strictKeywords: toBool((args.strictKeywords ?? config.strictKeywords) as string | undefined, false),
      keywords: (args.keywords ?? config.keywords) as any,
      logEnabled: toBool((args.logEnabled ?? config.logEnabled) as string | undefined, true),
      logPath: (args.logPath ?? config.logPath) as string | undefined,
      logFormat: (args.logFormat ?? config.logFormat) as any,
      logAppend: toBool((args.logAppend ?? config.logAppend) as string | undefined, false),
      logFlushEachRound: toBool((args.logFlushEachRound ?? config.logFlushEachRound) as string | undefined, false),
      logIncludeResults: toBool((args.logIncludeResults ?? config.logIncludeResults) as string | undefined, true),
      logIncludeOpened: toBool((args.logIncludeOpened ?? config.logIncludeOpened) as string | undefined, false),
      logIncludeSnippets: toBool((args.logIncludeSnippets ?? config.logIncludeSnippets) as string | undefined, true),
      logMaxResults: toInt((args.logMaxResults ?? config.logMaxResults) as string | undefined, 5),
      logMaxOpened: toInt((args.logMaxOpened ?? config.logMaxOpened) as string | undefined, 3),
    });

    console.log('goal:', response.goal);
    console.log('bestRoundIndex:', response.bestRoundIndex);
    console.log('decisionReason:', response.decisionReason);
    console.log('stopReason:', response.stopReason);
    console.log('logPath:', response.logPath);
  } finally {
    await rpa.closeBrowser();
  }
}

main().catch((error) => {
  console.error('adaptive search failed:', error);
  process.exitCode = 1;
});
