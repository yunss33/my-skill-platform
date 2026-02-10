import RPASkill from '../dist/index.js';

async function searchAntsCollaboration() {
  const rpa = new RPASkill();

  try {
    console.log('启动浏览器并访问 Bing 搜索...');
    await rpa.initBrowser({
      headless: true,
      channel: 'msedge',
      viewport: { width: 1440, height: 900 },
    });

    const query = '蚂蚁 信息素 协作 觅食 分工 site:baike.baidu.com OR site:wikipedia.org';
    const startUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans&cc=CN`;
    const maxPages = 2;
    const maxDetailPages = 3;
    const collected = [];
    const seen = new Set();

    const decodeBingUrl = (url) => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname.endsWith('bing.com') && parsed.pathname.startsWith('/ck/a')) {
          const encoded = parsed.searchParams.get('u');
          if (!encoded) {
            return url;
          }
          let base64 = encoded;
          if (base64.startsWith('a1')) {
            base64 = base64.slice(2);
          }
          const decoded = Buffer.from(base64, 'base64').toString('utf8');
          if (decoded.startsWith('http')) {
            return decoded;
          }
        }
      } catch {
        // ignore
      }
      return url;
    };

    try {
      let pageUrl = startUrl;
      for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
        const results = await rpa.searchOnSite({
          searchUrl: pageUrl,
          query,
          waitForLoadState: 'domcontentloaded',
          afterSearchDelayMs: 1500,
          list: {
            itemSelector: '#b_results .b_algo',
            fields: {
              title: { selector: 'h2 a', attr: 'text' },
              snippet: { selector: '.b_caption p', attr: 'text' },
              link: { selector: 'h2 a', attr: 'href' },
            },
          },
          limit: 10,
          screenshotPath: `ants_search_${Date.now()}_p${pageIndex}.png`,
        });

        const currentUrl = await rpa.getUrl();
        const queryValue = await rpa.extractAttribute('input[name="q"]', 'value');
        console.log(`\n第 ${pageIndex} 页 URL: ${currentUrl}`);
        if (queryValue) {
          console.log(`搜索框内容: ${queryValue}`);
        }

        for (const item of results) {
          const title = String(item.title ?? '').trim();
          const snippet = String(item.snippet ?? '').trim();
          const rawLink = String(item.link ?? '').trim();
          const link = decodeBingUrl(rawLink);
          const isRelevant = /蚂蚁|信息素|协作|觅食|分工|群体/.test(title + snippet);
          if (!isRelevant) {
            continue;
          }
          if (!title || !link || seen.has(link)) {
            continue;
          }
          seen.add(link);
          collected.push({
            title,
            snippet,
            link,
            index: collected.length + 1,
          });
        }

        const nextLink = await rpa.extractAttribute('a.sb_pagN', 'href');
        if (!nextLink) {
          break;
        }
        pageUrl = new URL(nextLink, pageUrl).toString();
      }
    } catch (error) {
      console.log('Bing 访问失败，稍后将尝试百度百科直达方式。');
    }

    console.log('\n搜索结果:');
    if (collected.length === 0) {
      console.log('未返回搜索列表，尝试直接打开百度百科“蚂蚁（膜翅目蚁科动物）”条目...');
      await rpa.navigate('https://baike.baidu.com/item/%E8%9A%82%E8%9A%81/9770178', {
        timeout: 60000,
        waitUntil: 'domcontentloaded',
      });
      await rpa.waitForElementVisible('body');

      const summaryBlocks = await rpa.extractAllText('.lemma-summary');
      const paragraphs = summaryBlocks.length > 0 ? summaryBlocks : await rpa.extractAllText('.para');
      const cleaned = paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
      const keywordParagraph =
        cleaned.find((p) => /信息素|社会性|协作|觅食|分工|群体/.test(p)) ??
        cleaned.find((p) => p.length > 40);

      const metaDescription = await rpa.extractAttribute('meta[name="description"]', 'content');
      const html = await rpa.extractPageSource();
      let embeddedDescription = '';
      const descMatch = html.match(/\"description\":\"(.*?)\",\"keywords\"/s);
      if (descMatch && descMatch[1]) {
        try {
          embeddedDescription = JSON.parse(`{\"description\":\"${descMatch[1]}\"}`).description;
        } catch {
          embeddedDescription = '';
        }
      }
      const summary = embeddedDescription || metaDescription || keywordParagraph;

      if (summary) {
        console.log('\n摘要:');
        console.log(summary);
      } else {
        console.log('未找到可用的正文段落。');
      }
      return;
    }

    collected.forEach((item) => {
      const index = typeof item.index === 'number' ? item.index : '';
      const title = item.title || '(无标题)';
      const snippet = item.snippet || '';
      const link = item.link || '';
      console.log(`${index}. ${title}`);
      if (snippet) {
        console.log(`   摘要: ${snippet}`);
      }
      if (link) {
        console.log(`   链接: ${link}`);
      }
      console.log('------------------------------------');
    });

    const ranked = [...collected].sort((a, b) => {
      const score = (item) => {
        const link = String(item.link ?? '');
        const title = String(item.title ?? '');
        if (/wikipedia\.org/i.test(link)) return 3;
        if (/baike\.baidu\.com/i.test(link)) return 2;
        if (/蚂蚁/.test(title) && !/蚂蚁集团|Ant Group/i.test(title)) return 1;
        return 0;
      };
      return score(b) - score(a);
    });

    console.log(`\n将打开前 ${maxDetailPages} 条结果并提取正文摘要...`);
    for (const item of ranked.slice(0, maxDetailPages)) {
      const link = String(item.link ?? '').trim();
      if (!link) {
        continue;
      }
      console.log(`\n打开：${item.title}`);
      await rpa.navigate(link, { timeout: 60000, waitUntil: 'domcontentloaded' });
      await rpa.waitForElementVisible('body');

      const paragraphs = await rpa.extractAllText('p');
      const cleaned = paragraphs.map((p) => p.trim()).filter((p) => p.length > 0);
      const keywordParagraph =
        cleaned.find((p) => /信息素|社会性|协作|觅食|分工|群体/.test(p)) ??
        cleaned.find((p) => p.length > 40);

      const metaDescription = await rpa.extractAttribute('meta[name="description"]', 'content');
      const summary = metaDescription || keywordParagraph;

      if (summary) {
        console.log('摘要:');
        console.log(summary);
      } else {
        console.log('未找到可用的正文段落。');
      }
    }
  } catch (error) {
    console.error('搜索过程中出现错误:', error);
  } finally {
    await rpa.closeBrowser();
  }
}

searchAntsCollaboration();
