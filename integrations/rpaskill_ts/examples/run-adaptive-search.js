import fs from 'node:fs';
import path from 'node:path';
import RPASkill from '../dist/index.js';

function parseArgs(argv) {
  const args = {};
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

function toBool(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

function toInt(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readConfig(configPath) {
  if (!configPath) return {};
  const resolved = path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath);
  const raw = fs.readFileSync(resolved, 'utf-8');
  return JSON.parse(raw);
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
  const query = args.query ?? config.query;
  if (!query) {
    throw new Error('Missing --query or config.query');
  }

  const rpa = new RPASkill();
  try {
    await rpa.initBrowser({
      headless: toBool(args.headless ?? config.headless, true),
      channel: args.channel ?? config.channel,
      viewport: { width: 1440, height: 900 },
    });

    const response = await rpa.adaptiveSearch({
      query,
      goal: args.goal ?? config.goal,
      language: args.language ?? config.language,
      engine: args.engine ?? config.engine,
      pages: toInt(args.pages ?? config.pages, 2),
      perPage: toInt(args.perPage ?? config.perPage, 10),
      details: toInt(args.details ?? config.details, 0),
      minResults: toInt(args.minResults ?? config.minResults, 5),
      maxRounds: toInt(args.maxRounds ?? config.maxRounds, 2),
      strictKeywords: toBool(args.strictKeywords ?? config.strictKeywords, false),
      keywords: args.keywords ?? config.keywords,
      logEnabled: toBool(args.logEnabled ?? config.logEnabled, true),
      logPath: args.logPath ?? config.logPath,
      logFormat: args.logFormat ?? config.logFormat,
      logAppend: toBool(args.logAppend ?? config.logAppend, false),
      logFlushEachRound: toBool(args.logFlushEachRound ?? config.logFlushEachRound, false),
      logIncludeResults: toBool(args.logIncludeResults ?? config.logIncludeResults, true),
      logIncludeOpened: toBool(args.logIncludeOpened ?? config.logIncludeOpened, false),
      logIncludeSnippets: toBool(args.logIncludeSnippets ?? config.logIncludeSnippets, true),
      logMaxResults: toInt(args.logMaxResults ?? config.logMaxResults, 5),
      logMaxOpened: toInt(args.logMaxOpened ?? config.logMaxOpened, 3),
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
