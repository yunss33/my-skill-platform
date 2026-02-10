import { webSearchSkill } from './webSearch.js';
import {
  AdaptiveSearchOptions,
  AdaptiveSearchResponse,
  AdaptiveSearchRound,
  ResultStructure,
  SearchTrends,
  SearchGoal,
  StructureAnalysis,
  WebSearchEngine,
  WebSearchOptions,
  WebSearchResponse,
} from '../types.js';
import { helper } from '../utils/helper.js';
import fs from 'node:fs';
import path from 'node:path';

type GoalConfig = {
  preferredDomains: string[];
  keywordHints: string[];
  keywordHintsEn: string[];
  querySuffixZh?: string;
  querySuffixEn?: string;
  siteFilters?: string[];
};

const GOAL_CONFIGS: Record<SearchGoal, GoalConfig> = {
  auto: {
    preferredDomains: ['wikipedia.org', 'baike.baidu.com'],
    keywordHints: [],
    keywordHintsEn: [],
  },
  popular: {
    preferredDomains: ['wikipedia.org', 'baike.baidu.com', 'britannica.com', 'zhihu.com'],
    keywordHints: ['是什么', '定义', '原理', '机制', '作用', '特点'],
    keywordHintsEn: ['definition', 'overview', 'principle', 'mechanism', 'how', 'what'],
    querySuffixZh: '是什么 原理 机制',
    querySuffixEn: 'definition overview mechanism',
    siteFilters: ['wikipedia.org', 'baike.baidu.com', 'britannica.com'],
  },
  academic: {
    preferredDomains: ['scholar.google.com', 'arxiv.org', 'ieee.org', 'acm.org', 'springer.com', 'sciencedirect.com'],
    keywordHints: ['论文', '研究', '综述', '期刊', '实验', '方法'],
    keywordHintsEn: ['paper', 'study', 'survey', 'review', 'dataset', 'method'],
    querySuffixZh: '论文 研究 综述',
    querySuffixEn: 'paper survey review',
    siteFilters: ['scholar.google.com', 'arxiv.org', 'ieee.org', 'acm.org', 'springer.com', 'sciencedirect.com'],
  },
  shopping: {
    preferredDomains: ['taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'amazon.com'],
    keywordHints: ['价格', '多少钱', '优惠', '折扣', '评价', '旗舰店'],
    keywordHintsEn: ['price', 'deal', 'discount', 'review', 'official', 'store'],
    querySuffixZh: '价格 多少钱 评价',
    querySuffixEn: 'price review discount',
    siteFilters: ['taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com'],
  },
  technical: {
    preferredDomains: ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'learn.microsoft.com', 'nodejs.org', 'python.org'],
    keywordHints: ['教程', '文档', 'API', '报错', '解决', '示例'],
    keywordHintsEn: ['docs', 'api', 'guide', 'tutorial', 'error', 'example'],
    querySuffixZh: '教程 文档 API',
    querySuffixEn: 'docs api tutorial',
    siteFilters: ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'learn.microsoft.com'],
  },
};

function detectLanguage(query: string, override?: AdaptiveSearchOptions['language']): 'zh' | 'en' {
  if (override && override !== 'auto') return override;
  return /[\u4e00-\u9fa5]/.test(query) ? 'zh' : 'en';
}

function detectGoal(query: string): SearchGoal {
  const text = query.toLowerCase();
  if (/(价格|多少钱|优惠|折扣|购买|淘宝|天猫|京东|拼多多)/i.test(query) || /(price|deal|discount|buy|shopping|store)/i.test(text)) {
    return 'shopping';
  }
  if (/(论文|研究|期刊|综述|arxiv|doi)/i.test(query) || /(paper|study|survey|review|arxiv|doi)/i.test(text)) {
    return 'academic';
  }
  if (/(报错|错误|bug|异常|教程|文档|api|sdk|源码|实现)/i.test(query) || /(error|bug|exception|tutorial|docs|api|sdk|implementation)/i.test(text)) {
    return 'technical';
  }
  return 'popular';
}

function buildKeywordRegex(keywords: string[]): RegExp | null {
  const parts = keywords.map((k) => helper.escapeRegExp(k)).filter(Boolean);
  if (parts.length === 0) return null;
  return new RegExp(parts.join('|'), 'i');
}

function mergeKeywords(query: string, config: GoalConfig, language: 'zh' | 'en', extra?: AdaptiveSearchOptions['keywords']): string[] {
  const base = language === 'zh' ? config.keywordHints : config.keywordHintsEn;
  const extraList =
    typeof extra === 'string'
      ? extra.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
      : (extra ?? []).map((s) => String(s).trim()).filter(Boolean);
  const tokens = query.split(/\s+/).map((s) => s.trim()).filter((s) => s.length > 1);
  return Array.from(new Set([...base, ...extraList, ...tokens]));
}

function buildQuery(base: string, config: GoalConfig, language: 'zh' | 'en', roundIndex: number): string {
  if (roundIndex === 0) return base;
  const suffix = language === 'zh' ? config.querySuffixZh : config.querySuffixEn;
  const siteFilters = config.siteFilters?.length
    ? `(${config.siteFilters.map((site) => `site:${site}`).join(' OR ')})`
    : '';
  return [base, suffix, siteFilters].filter(Boolean).join(' ').trim();
}

type SimpleResult = { title: string; snippet: string; url: string };
type SimpleResponse = { results: SimpleResult[] };

function scoreResponse(response: SimpleResponse, keywordRegex: RegExp | null) {
  const results = response.results ?? [];
  const hits = keywordRegex
    ? results.filter((item) => keywordRegex.test(`${item.title} ${item.snippet}`)).length
    : results.length;
  const domains = new Set<string>();
  for (const item of results) {
    try {
      domains.add(new URL(item.url).hostname);
    } catch {
      // ignore
    }
  }
  const score = hits * 2 + domains.size * 0.3 + Math.min(results.length, 10) * 0.1;
  return { hits, score };
}

function ensureDirForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!dir || dir === '.') return;
  fs.mkdirSync(dir, { recursive: true });
}

function truncateText(text: string, maxLength: number): string {
  return helper.truncate(text, maxLength);
}

function collectMatchedKeywords(results: SimpleResult[], keywords: string[], language: 'zh' | 'en'): string[] {
  if (keywords.length === 0) return [];
  const found = new Set<string>();
  const text = results.map((item) => `${item.title} ${item.snippet}`.trim()).join(' ');
  const haystack = language === 'en' ? text.toLowerCase() : text;
  for (const keyword of keywords) {
    const needle = language === 'en' ? keyword.toLowerCase() : keyword;
    if (needle && haystack.includes(needle)) {
      found.add(keyword);
    }
  }
  return Array.from(found);
}

function extractStructureFeatures(results: SimpleResult[], keywords: string[], language: 'zh' | 'en') {
  const features = {
    // Basic features
    itemCount: results.length,
    hasTitles: results.some(item => item.title && item.title.trim().length > 0),
    hasSnippets: results.some(item => item.snippet && item.snippet.trim().length > 0),
    hasUrls: results.some(item => item.url && item.url.trim().length > 0),
    
    // Semantic features
    titleLengths: results.map(item => item.title ? item.title.length : 0),
    snippetLengths: results.map(item => item.snippet ? item.snippet.length : 0),
    averageTitleLength: 0,
    averageSnippetLength: 0,
    
    // Keyword features
    keywordDensity: 0,
    keywordDistribution: {} as Record<string, number>,
    
    // Domain features
    domainDistribution: {} as Record<string, number>,
    uniqueDomains: 0,
    topDomain: '',
    
    // Quality features
    duplicateTitles: 0,
    emptyFields: 0,
    
    // Format features
    hasNumbers: false,
    hasDates: false,
    hasUrlsInSnippets: false
  };
  
  // Calculate semantic features
  if (features.itemCount > 0) {
    features.averageTitleLength = features.titleLengths.reduce((sum, len) => sum + len, 0) / features.itemCount;
    features.averageSnippetLength = features.snippetLengths.reduce((sum, len) => sum + len, 0) / features.itemCount;
  }
  
  // Calculate domain features
  for (const item of results) {
    try {
      const domain = new URL(item.url).hostname;
      features.domainDistribution[domain] = (features.domainDistribution[domain] || 0) + 1;
    } catch {
      // ignore
    }
  }
  features.uniqueDomains = Object.keys(features.domainDistribution).length;
  
  // Find top domain
  let maxDomainCount = 0;
  for (const [domain, count] of Object.entries(features.domainDistribution)) {
    if (count > maxDomainCount) {
      maxDomainCount = count;
      features.topDomain = domain;
    }
  }
  
  // Calculate keyword features
  const matchedKeywords = collectMatchedKeywords(results, keywords, language);
  features.keywordDensity = matchedKeywords.length / Math.max(keywords.length, 1);
  for (const keyword of matchedKeywords) {
    features.keywordDistribution[keyword] = (features.keywordDistribution[keyword] || 0) + 1;
  }
  
  // Calculate quality features
  const titles = results.map(item => item.title?.toLowerCase() || '');
  const titleCounts = {} as Record<string, number>;
  for (const title of titles) {
    if (title) {
      titleCounts[title] = (titleCounts[title] || 0) + 1;
    }
  }
  features.duplicateTitles = Object.values(titleCounts).filter(count => count > 1).length;
  
  // Count empty fields
  for (const item of results) {
    if (!item.title || !item.snippet || !item.url) {
      features.emptyFields++;
    }
  }
  
  // Calculate format features
  const textContent = results.map(item => `${item.title || ''} ${item.snippet || ''}`).join(' ');
  features.hasNumbers = /\d+/.test(textContent);
  features.hasDates = /\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2}/.test(textContent);
  features.hasUrlsInSnippets = results.some(item => item.snippet && /https?:\/\//.test(item.snippet));
  
  return features;
}

function analyzeResultStructure(results: SimpleResult[], keywords: string[], language: 'zh' | 'en'): ResultStructure {
  const features = extractStructureFeatures(results, keywords, language);
  const itemCount = features.itemCount;
  const hasTitles = features.hasTitles;
  const hasSnippets = features.hasSnippets;
  const hasUrls = features.hasUrls;
  
  // Calculate relevance score
  const relevanceScore = features.keywordDensity;
  
  // Calculate structural score with enhanced features
  let structuralScore = 0;
  if (hasTitles) structuralScore += 0.2;
  if (hasSnippets) structuralScore += 0.2;
  if (hasUrls) structuralScore += 0.1;
  if (itemCount > 0) structuralScore += Math.min(itemCount / 10, 0.1);
  if (features.uniqueDomains > 2) structuralScore += 0.1;
  if (features.averageSnippetLength > 50) structuralScore += 0.1;
  if (features.duplicateTitles === 0) structuralScore += 0.1;
  if (features.emptyFields === 0) structuralScore += 0.1;
  
  // Determine structure type with enhanced analysis
  let type: 'list' | 'table' | 'mixed' | 'none' = 'none';
  if (itemCount === 0) {
    type = 'none';
  } else if (hasTitles && hasSnippets && hasUrls && features.uniqueDomains > 1) {
    type = 'list';
  } else if (features.hasNumbers && features.hasDates) {
    type = 'table';
  } else {
    type = 'mixed';
  }
  
  return {
    type,
    itemCount,
    hasTitles,
    hasSnippets,
    hasUrls,
    domainDistribution: features.domainDistribution,
    relevanceScore,
    structuralScore,
    features
  };
}

function generateStructureAnalysis(structure: ResultStructure, query: string, language: 'zh' | 'en'): StructureAnalysis {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  
  // Analyze strengths
  if (structure.itemCount > 5) {
    strengths.push(language === 'zh' ? '结果数量充足' : 'Sufficient result count');
  }
  if (structure.relevanceScore > 0.7) {
    strengths.push(language === 'zh' ? '高相关性' : 'High relevance');
  }
  if (structure.structuralScore > 0.8) {
    strengths.push(language === 'zh' ? '结构完整' : 'Complete structure');
  }
  
  // Analyze weaknesses
  if (structure.itemCount < 3) {
    weaknesses.push(language === 'zh' ? '结果数量不足' : 'Insufficient result count');
  }
  if (structure.relevanceScore < 0.3) {
    weaknesses.push(language === 'zh' ? '相关性低' : 'Low relevance');
  }
  if (structure.structuralScore < 0.5) {
    weaknesses.push(language === 'zh' ? '结构不完整' : 'Incomplete structure');
  }
  
  // Generate suggestions
  if (structure.itemCount < 3) {
    suggestions.push(language === 'zh' ? '尝试使用更通用的关键词' : 'Try using more general keywords');
    suggestions.push(language === 'zh' ? '添加相关同义词' : 'Add related synonyms');
  }
  if (structure.relevanceScore < 0.3) {
    suggestions.push(language === 'zh' ? '使用更具体的关键词' : 'Use more specific keywords');
    suggestions.push(language === 'zh' ? '添加限定词' : 'Add限定词');
  }
  if (structure.structuralScore < 0.5) {
    suggestions.push(language === 'zh' ? '尝试不同的搜索引擎' : 'Try a different search engine');
    suggestions.push(language === 'zh' ? '调整搜索策略' : 'Adjust search strategy');
  }
  
  // Calculate confidence
  const confidence = Math.min((structure.relevanceScore + structure.structuralScore) / 2, 1);
  
  return {
    structure,
    strengths,
    weaknesses,
    suggestions,
    confidence
  };
}

function generateThoughtProcess(analysis: ReturnType<typeof generateStructureAnalysis>, roundIndex: number, language: 'zh' | 'en') {
  const thoughts: string[] = [];
  
  if (roundIndex === 0) {
    thoughts.push(language === 'zh' ? '开始第一轮搜索，分析初始查询结构' : 'Starting first round search, analyzing initial query structure');
    thoughts.push(language === 'zh' ? '初始查询分析：评估查询的清晰度和具体性' : 'Initial query analysis: Evaluating query clarity and specificity');
  } else {
    thoughts.push(language === 'zh' ? `进行第${roundIndex + 1}轮搜索，基于前一轮结果进行优化` : `Conducting round ${roundIndex + 1}, optimizing based on previous results`);
    thoughts.push(language === 'zh' ? '前一轮分析：识别需要改进的方面' : 'Previous round analysis: Identifying areas for improvement');
  }
  
  // Analyze current results
  if (analysis.structure.itemCount === 0) {
    thoughts.push(language === 'zh' ? '未找到任何结果，需要调整搜索策略' : 'No results found, need to adjust search strategy');
    thoughts.push(language === 'zh' ? '结果分析：查询可能过于具体或使用了错误的关键词' : 'Result analysis: Query may be too specific or using incorrect keywords');
  } else {
    thoughts.push(language === 'zh' ? `找到${analysis.structure.itemCount}个结果，分析其相关性和结构` : `Found ${analysis.structure.itemCount} results, analyzing relevance and structure`);
    thoughts.push(language === 'zh' ? `结果数量分析：${analysis.structure.itemCount}个结果 ${analysis.structure.itemCount > 5 ? '充足' : '不足'}` : `Result count analysis: ${analysis.structure.itemCount} results ${analysis.structure.itemCount > 5 ? 'sufficient' : 'insufficient'}`);
  }
  
  // Analyze relevance
  const relevanceScore = (analysis.structure.relevanceScore * 100).toFixed(1);
  if (analysis.structure.relevanceScore > 0.7) {
    thoughts.push(language === 'zh' ? `结果相关性分析：相关性得分${relevanceScore}%，相关性高` : `Relevance analysis: Score ${relevanceScore}%, high relevance`);
    thoughts.push(language === 'zh' ? '继续优化结构和结果质量' : 'Continuing to optimize structure and result quality');
  } else if (analysis.structure.relevanceScore < 0.3) {
    thoughts.push(language === 'zh' ? `结果相关性分析：相关性得分${relevanceScore}%，相关性低` : `Relevance analysis: Score ${relevanceScore}%, low relevance`);
    thoughts.push(language === 'zh' ? '需要调整关键词或查询策略' : 'Need to adjust keywords or query strategy');
  } else {
    thoughts.push(language === 'zh' ? `结果相关性分析：相关性得分${relevanceScore}%，相关性一般` : `Relevance analysis: Score ${relevanceScore}%, moderate relevance`);
    thoughts.push(language === 'zh' ? '需要进一步优化相关性' : 'Need further optimization for relevance');
  }
  
  // Analyze structure
  const structuralScore = (analysis.structure.structuralScore * 100).toFixed(1);
  if (analysis.structure.structuralScore > 0.8) {
    thoughts.push(language === 'zh' ? `结果结构分析：结构得分${structuralScore}%，结构完整` : `Structure analysis: Score ${structuralScore}%, complete structure`);
    thoughts.push(language === 'zh' ? '继续优化相关性和结果质量' : 'Continuing to optimize relevance and result quality');
  } else if (analysis.structure.structuralScore < 0.5) {
    thoughts.push(language === 'zh' ? `结果结构分析：结构得分${structuralScore}%，结构不完整` : `Structure analysis: Score ${structuralScore}%, incomplete structure`);
    thoughts.push(language === 'zh' ? '需要调整搜索策略或尝试不同的搜索引擎' : 'Need to adjust search strategy or try different search engine');
  } else {
    thoughts.push(language === 'zh' ? `结果结构分析：结构得分${structuralScore}%，结构一般` : `Structure analysis: Score ${structuralScore}%, moderate structure`);
    thoughts.push(language === 'zh' ? '需要进一步优化结构完整性' : 'Need further optimization for structure completeness');
  }
  
  // Analyze domain distribution
  const domainCount = Object.keys(analysis.structure.domainDistribution).length;
  thoughts.push(language === 'zh' ? `域名分布分析：来自${domainCount}个不同域名` : `Domain distribution analysis: From ${domainCount} different domains`);
  if (domainCount === 0) {
    thoughts.push(language === 'zh' ? '域名分析：未找到有效域名，可能需要调整搜索策略' : 'Domain analysis: No valid domains found, may need to adjust search strategy');
  } else if (domainCount < 3) {
    thoughts.push(language === 'zh' ? '域名分析：域名多样性不足，可能存在信息偏差' : 'Domain analysis: Insufficient domain diversity, potential information bias');
  }
  
  // Analyze strengths and weaknesses
  if (analysis.strengths.length > 0) {
    thoughts.push(language === 'zh' ? `优势分析：${analysis.strengths.join('、')}` : `Strengths analysis: ${analysis.strengths.join(', ')}`);
  }
  if (analysis.weaknesses.length > 0) {
    thoughts.push(language === 'zh' ? `劣势分析：${analysis.weaknesses.join('、')}` : `Weaknesses analysis: ${analysis.weaknesses.join(', ')}`);
  }
  
  // Generate next steps
  if (analysis.suggestions.length > 0) {
    thoughts.push(language === 'zh' ? '优化建议：' : 'Optimization suggestions:');
    analysis.suggestions.forEach((suggestion, index) => {
      thoughts.push(language === 'zh' ? `${index + 1}. ${suggestion}` : `${index + 1}. ${suggestion}`);
    });
  }
  
  // Add confidence analysis
  const confidenceScore = (analysis.confidence * 100).toFixed(1);
  thoughts.push(language === 'zh' ? `分析置信度：${confidenceScore}%` : `Analysis confidence: ${confidenceScore}%`);
  if (analysis.confidence < 0.5) {
    thoughts.push(language === 'zh' ? '置信度分析：分析结果可靠性较低，需要进一步验证' : 'Confidence analysis: Analysis results have low reliability, need further verification');
  }
  
  return thoughts;
}

function optimizeQueryBasedOnStructure(baseQuery: string, analysis: ReturnType<typeof generateStructureAnalysis>, language: 'zh' | 'en') {
  let optimizedQuery = baseQuery;
  const suggestions = analysis.suggestions;
  
  // Based on structure analysis, generate optimized query
  if (analysis.structure.relevanceScore < 0.3) {
    // Low relevance: make query more specific
    if (language === 'zh') {
      optimizedQuery += ' 详细信息';
    } else {
      optimizedQuery += ' detailed information';
    }
  } else if (analysis.structure.itemCount < 3) {
    // Too few results: make query more general
    if (language === 'zh') {
      optimizedQuery = optimizedQuery.replace(/ 详细| 具体/g, '');
    } else {
      optimizedQuery = optimizedQuery.replace(/ detailed| specific/g, '');
    }
  }
  
  // Add domain-specific optimizations
  if (analysis.structure.type === 'none') {
    if (language === 'zh') {
      optimizedQuery += ' 官方网站';
    } else {
      optimizedQuery += ' official website';
    }
  }
  
  return optimizedQuery.trim();
}

function adjustSearchStrategyBasedOnStructure(previousAnalysis: ReturnType<typeof generateStructureAnalysis>) {
  const adjustments = {
    engineChange: false,
    newEngine: 'bing' as WebSearchEngine,
    domainAdjustment: false,
    newDomains: [] as string[],
    pageAdjustment: false,
    newPageCount: 2,
    perPageAdjustment: false,
    newPerPageCount: 10
  };
  
  // Adjust search engine if structure is poor
  if (previousAnalysis.structure.structuralScore < 0.4) {
    adjustments.engineChange = true;
    adjustments.newEngine = 'baidu'; // Try different engine
  }
  
  // Adjust page count if results are insufficient
  if (previousAnalysis.structure.itemCount < 5) {
    adjustments.pageAdjustment = true;
    adjustments.newPageCount = 3; // Increase page count
  }
  
  // Adjust per page count if results are too few
  if (previousAnalysis.structure.itemCount < 3) {
    adjustments.perPageAdjustment = true;
    adjustments.newPerPageCount = 15; // Increase per page count
  }
  
  return adjustments;
}

function analyzeSearchTrends(rounds: AdaptiveSearchRound[]): SearchTrends {
  if (rounds.length === 0) {
    return {
      scoreTrend: 'stable',
      relevanceTrend: 'stable',
      structureTrend: 'stable',
      itemCountTrend: 'stable',
      improvementRate: 0,
      bestImprovementArea: 'none'
    };
  }
  
  // Calculate trends
  const scores = rounds.map(r => r.score);
  const relevanceScores = rounds.map(r => r.structureAnalysis?.structure.relevanceScore || 0);
  const structureScores = rounds.map(r => r.structureAnalysis?.structure.structuralScore || 0);
  const itemCounts = rounds.map(r => r.resultCount || 0);
  
  // Determine trends
  const scoreTrend = scores.length > 1 && scores[scores.length - 1] > scores[0] ? 'improving' : 
                    scores.length > 1 && scores[scores.length - 1] < scores[0] ? 'declining' : 'stable';
  
  const relevanceTrend = relevanceScores.length > 1 && relevanceScores[relevanceScores.length - 1] > relevanceScores[0] ? 'improving' : 
                         relevanceScores.length > 1 && relevanceScores[relevanceScores.length - 1] < relevanceScores[0] ? 'declining' : 'stable';
  
  const structureTrend = structureScores.length > 1 && structureScores[structureScores.length - 1] > structureScores[0] ? 'improving' : 
                         structureScores.length > 1 && structureScores[structureScores.length - 1] < structureScores[0] ? 'declining' : 'stable';
  
  const itemCountTrend = itemCounts.length > 1 && itemCounts[itemCounts.length - 1] > itemCounts[0] ? 'improving' : 
                         itemCounts.length > 1 && itemCounts[itemCounts.length - 1] < itemCounts[0] ? 'declining' : 'stable';
  
  // Calculate improvement rate
  const improvementRate = rounds.length > 1 ? 
    (rounds[rounds.length - 1].score - rounds[0].score) / rounds[0].score : 0;
  
  // Determine best improvement area
  const improvements = {
    relevance: relevanceScores.length > 1 ? relevanceScores[relevanceScores.length - 1] - relevanceScores[0] : 0,
    structure: structureScores.length > 1 ? structureScores[structureScores.length - 1] - structureScores[0] : 0,
    itemCount: itemCounts.length > 1 ? itemCounts[itemCounts.length - 1] - itemCounts[0] : 0
  };
  
  let bestImprovementArea = 'none';
  let maxImprovement = 0;
  
  for (const [area, improvement] of Object.entries(improvements)) {
    if (improvement > maxImprovement) {
      maxImprovement = improvement;
      bestImprovementArea = area;
    }
  }
  
  return {
    scoreTrend,
    relevanceTrend,
    structureTrend,
    itemCountTrend,
    improvementRate,
    bestImprovementArea
  };
}

function generateProgressiveOptimization(rounds: AdaptiveSearchRound[], language: 'zh' | 'en') {
  const trends = analyzeSearchTrends(rounds);
  const optimizations: string[] = [];
  
  // Generate optimization suggestions based on trends
  if (trends.scoreTrend === 'improving') {
    optimizations.push(language === 'zh' ? '搜索效果正在改善，继续当前优化策略' : 'Search performance is improving, continue current optimization strategy');
  } else if (trends.scoreTrend === 'declining') {
    optimizations.push(language === 'zh' ? '搜索效果正在下降，需要调整优化策略' : 'Search performance is declining, need to adjust optimization strategy');
  }
  
  if (trends.relevanceTrend === 'declining') {
    optimizations.push(language === 'zh' ? '相关性正在下降，需要重新评估关键词选择' : 'Relevance is declining, need to reevaluate keyword selection');
  }
  
  if (trends.structureTrend === 'declining') {
    optimizations.push(language === 'zh' ? '结果结构正在恶化，需要调整搜索策略' : 'Result structure is deteriorating, need to adjust search strategy');
  }
  
  if (trends.itemCountTrend === 'declining') {
    optimizations.push(language === 'zh' ? '结果数量正在减少，需要扩大搜索范围' : 'Result count is decreasing, need to expand search scope');
  }
  
  // Add improvement rate analysis
  const improvementPercent = (trends.improvementRate * 100).toFixed(1);
  if (trends.improvementRate > 0.1) {
    optimizations.push(language === 'zh' ? `搜索效果提升了${improvementPercent}%，优化策略有效` : `Search performance improved by ${improvementPercent}%, optimization strategy is effective`);
  } else if (trends.improvementRate < -0.1) {
    optimizations.push(language === 'zh' ? `搜索效果下降了${Math.abs(parseFloat(improvementPercent))}%，需要调整策略` : `Search performance decreased by ${Math.abs(parseFloat(improvementPercent))}%, need to adjust strategy`);
  }
  
  // Add best improvement area analysis
  if (trends.bestImprovementArea !== 'none') {
    const areaMap: Record<string, string> = {
      relevance: language === 'zh' ? '相关性' : 'relevance',
      structure: language === 'zh' ? '结构' : 'structure',
      itemCount: language === 'zh' ? '结果数量' : 'result count'
    };
    optimizations.push(language === 'zh' ? `最佳改进领域：${areaMap[trends.bestImprovementArea]}` : `Best improvement area: ${areaMap[trends.bestImprovementArea]}`);
  }
  
  return optimizations;
}

export class AdaptiveSearchSkill {
  async search(options: AdaptiveSearchOptions): Promise<AdaptiveSearchResponse> {
    if (!options.query) {
      throw new Error('AdaptiveSearchOptions.query is required.');
    }

    const language = detectLanguage(options.query, options.language);
    const detectedGoal = options.goal && options.goal !== 'auto' ? options.goal : detectGoal(options.query);
    const config = GOAL_CONFIGS[detectedGoal];
    const maxRounds = Math.max(1, options.maxRounds ?? 2);
    const minResults = Math.max(1, options.minResults ?? 6);

    const keywordList = mergeKeywords(options.query, config, language, options.keywords);
    const keywordRegex = buildKeywordRegex(keywordList);

  const rounds: AdaptiveSearchRound[] = [];
  let bestRound: AdaptiveSearchRound | null = null;
  let stopReason: string | undefined;
  let decisionReason: string | undefined;
  let logPath: string | undefined;
  const logFormat = options.logFormat ?? 'json';
  const logAppend = options.logAppend ?? logFormat === 'jsonl';
  const logFlushEachRound = options.logFlushEachRound ?? logFormat === 'jsonl';
  const logIncludeResults = options.logIncludeResults ?? true;
  const logIncludeOpened = options.logIncludeOpened ?? false;
  const logIncludeSnippets = options.logIncludeSnippets ?? true;
  const logMaxResults = Math.max(1, options.logMaxResults ?? 5);
  const logMaxOpened = Math.max(1, options.logMaxOpened ?? 3);
  const logEnabled = options.logEnabled || !!options.logPath;
  let currentEngine = (options.engine ?? 'bing') as WebSearchEngine;
  let currentPages = options.pages ?? 2;
  let currentPerPage = options.perPage ?? 10;

    for (let i = 0; i < maxRounds; i += 1) {
      // Build query with structure-based optimization for subsequent rounds
      let query = options.query;
      if (i > 0 && rounds.length > 0) {
        const previousRound = rounds[i - 1];
        if (previousRound.structureAnalysis) {
          query = optimizeQueryBasedOnStructure(query, previousRound.structureAnalysis, language);
        }
      }
      const searchOptions: WebSearchOptions = {
        engine: currentEngine,
        query,
        pages: currentPages,
        perPage: currentPerPage,
        details: options.details ?? 0,
        preferredDomains: options.preferredDomains ?? config.preferredDomains,
        keywords: options.strictKeywords ? keywordList : undefined,
        screenshotPrefix: options.screenshotPrefix,
        openScreenshotPrefix: options.openScreenshotPrefix,
        openScreenshotFullPage: options.openScreenshotFullPage,
        tracePath: options.tracePath,
        // For adaptive search we may call webSearch multiple times; only the first round truncates.
        traceAppend: i > 0 ? true : options.traceAppend,
        afterSearchDelayMs: options.afterSearchDelayMs,
        navigationTimeout: options.navigationTimeout,
        baikeUrl: options.baikeUrl,
      };

      let response: WebSearchResponse;
      let errorMessage: string | undefined;
      try {
        response = await webSearchSkill.search(searchOptions);
      } catch (error) {
        errorMessage = (error as Error)?.message ?? String(error);
        response = {
          engine: searchOptions.engine ?? 'bing',
          query: searchOptions.query,
          results: [],
          opened: [],
          fallbackUsed: false,
        };
      }

      const { hits, score } = scoreResponse(response, keywordRegex);
      const matchedKeywords = collectMatchedKeywords(response.results ?? [], keywordList, language);
      const topTitles = response.results.slice(0, 3).map((item) => item.title).filter(Boolean);
      const notes: string[] = [];
      if (matchedKeywords.length > 0) notes.push(`matchedKeywords=${matchedKeywords.length}`);
      if (hits === 0) notes.push('noKeywordHits');
      if (response.results.length === 0) notes.push('noResults');
      if (response.fallbackUsed) notes.push('fallbackUsed');
      if (errorMessage) notes.push('error');
      
      // Analyze result structure
      const structure = analyzeResultStructure(response.results ?? [], keywordList, language);
      const structureAnalysis = generateStructureAnalysis(structure, options.query, language);
      const thoughtProcess = generateThoughtProcess(structureAnalysis, i, language);

      const expandedQuery = i > 0;
      const round: AdaptiveSearchRound = {
        query,
        goal: detectedGoal,
        engine: searchOptions.engine ?? 'bing',
        preferredDomains: searchOptions.preferredDomains ?? [],
        keywordHints: keywordList,
        hits,
        score,
        matchedKeywords,
        topTitles,
        notes,
        resultCount: response.results.length,
        error: errorMessage,
        roundIndex: i,
        expandedQuery,
        response,
        structureAnalysis,
        thoughtProcess,
      };

      if (hits < minResults && i < maxRounds - 1) {
        round.continueReason = 'hitsBelowMinResults';
      }

      rounds.push(round);
      if (!bestRound || score > bestRound.score) {
        bestRound = round;
      }

      if (logEnabled && logFlushEachRound) {
        logPath = options.logPath ?? `artifacts/search-log-${Date.now()}.jsonl`;
        ensureDirForFile(logPath);
        const roundLog = {
          type: 'round',
          timestamp: new Date().toISOString(),
          roundIndex: i,
          query: round.query,
          goal: round.goal,
          hits: round.hits,
          score: round.score,
          matchedKeywords: round.matchedKeywords ?? [],
          topTitles: round.topTitles ?? [],
          notes: round.notes ?? [],
          preferredDomains: round.preferredDomains,
          resultCount: round.resultCount ?? 0,
          error: round.error,
          structureAnalysis: round.structureAnalysis ? {
            structure: round.structureAnalysis.structure,
            strengths: round.structureAnalysis.strengths,
            weaknesses: round.structureAnalysis.weaknesses,
            suggestions: round.structureAnalysis.suggestions,
            confidence: round.structureAnalysis.confidence
          } : undefined,
          structureFeatures: round.structureAnalysis?.structure.features,
          thoughtProcess: round.thoughtProcess,
          results: logIncludeResults
            ? round.response.results.slice(0, logMaxResults).map((item) => ({
                title: item.title,
                url: item.url,
                snippet: logIncludeSnippets ? truncateText(item.snippet ?? '', 220) : undefined,
              }))
            : undefined,
          opened: logIncludeOpened
            ? round.response.opened.slice(0, logMaxOpened).map((item) => ({
                title: item.title,
                url: item.url,
                summary: truncateText(item.summary ?? '', 260),
              }))
            : undefined,
          continueReason: round.continueReason,
          expandedQuery,
          // Add search strategy adjustments
          searchStrategy: {
            engine: currentEngine,
            pages: currentPages,
            perPage: currentPerPage
          }
        };
        fs.appendFileSync(logPath, `${JSON.stringify(roundLog)}\n`, 'utf-8');
      }

      if (hits >= minResults) {
        stopReason = 'minResultsReached';
        break;
      }
      
      // Adjust search strategy based on structure analysis for next round
      if (i < maxRounds - 1 && round.structureAnalysis) {
        const adjustments = adjustSearchStrategyBasedOnStructure(round.structureAnalysis);
        if (adjustments.engineChange) {
          currentEngine = adjustments.newEngine;
        }
        if (adjustments.pageAdjustment) {
          currentPages = adjustments.newPageCount;
        }
        if (adjustments.perPageAdjustment) {
          currentPerPage = adjustments.newPerPageCount;
        }
      }
    }

    if (!stopReason) {
      stopReason = 'maxRoundsReached';
    }

    if (bestRound) {
      decisionReason = `bestScore=${bestRound.score.toFixed(2)}`;
    } else {
      decisionReason = 'noBestRound';
    }

    if (logEnabled) {
      logPath = options.logPath ?? `artifacts/search-log-${Date.now()}.json`;
      const bestRoundIndex = bestRound ? rounds.indexOf(bestRound) : -1;
      const trends = analyzeSearchTrends(rounds);
      const progressiveOptimizations = generateProgressiveOptimization(rounds, language);
      const logData = {
        type: 'summary',
        timestamp: new Date().toISOString(),
        query: options.query,
        goal: detectedGoal,
        language,
        engine: options.engine ?? 'bing',
        minResults,
        maxRounds,
        decisionReason,
        stopReason,
        bestRoundIndex,
        trends,
        progressiveOptimizations,
        rounds: rounds.map((round) => ({
          roundIndex: round.roundIndex ?? 0,
          query: round.query,
          hits: round.hits,
          score: round.score,
          matchedKeywords: round.matchedKeywords ?? [],
          topTitles: round.topTitles ?? [],
          notes: round.notes ?? [],
          preferredDomains: round.preferredDomains,
          resultCount: round.resultCount ?? 0,
          error: round.error,
          structureAnalysis: round.structureAnalysis ? {
            structure: round.structureAnalysis.structure,
            strengths: round.structureAnalysis.strengths,
            weaknesses: round.structureAnalysis.weaknesses,
            suggestions: round.structureAnalysis.suggestions,
            confidence: round.structureAnalysis.confidence
          } : undefined,
          structureFeatures: round.structureAnalysis?.structure.features,
          thoughtProcess: round.thoughtProcess,
          continueReason: round.continueReason,
          expandedQuery: round.expandedQuery,
          results: logIncludeResults
            ? round.response.results.slice(0, logMaxResults).map((item) => ({
                title: item.title,
                url: item.url,
                snippet: logIncludeSnippets ? truncateText(item.snippet ?? '', 220) : undefined,
              }))
            : undefined,
          opened: logIncludeOpened
            ? round.response.opened.slice(0, logMaxOpened).map((item) => ({
                title: item.title,
                url: item.url,
                summary: truncateText(item.summary ?? '', 260),
              }))
            : undefined,
        })),
      };
      ensureDirForFile(logPath);
      const payload = logFormat === 'jsonl' ? `${JSON.stringify(logData)}\n` : JSON.stringify(logData, null, 2);
      if (logAppend) {
        fs.appendFileSync(logPath, payload, 'utf-8');
      } else {
        fs.writeFileSync(logPath, payload, 'utf-8');
      }
    }

    // Analyze search trends and generate progressive optimizations
    const trends = analyzeSearchTrends(rounds);
    const progressiveOptimizations = generateProgressiveOptimization(rounds, language);

    return {
      goal: detectedGoal,
      language,
      rounds,
      best: bestRound,
      bestRoundIndex: bestRound ? rounds.indexOf(bestRound) : -1,
      decisionReason,
      stopReason,
      logPath,
      logFormat,
      logFlushEachRound,
      trends,
      progressiveOptimizations,
    };
  }
}

export const adaptiveSearchSkill = new AdaptiveSearchSkill();
