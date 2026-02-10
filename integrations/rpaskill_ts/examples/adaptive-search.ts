import RPASkill from '../src/index';

async function adaptiveSearchExample() {
  const rpa = new RPASkill();

  try {
    await rpa.initBrowser({
      headless: true,
      viewport: { width: 1440, height: 900 },
    });

    const response = await rpa.adaptiveSearch({
      query: '蚂蚁 如何 沟通',
      goal: 'auto',
      pages: 2,
      details: 1,
      maxRounds: 2,
      minResults: 5,
      logEnabled: true,
      logFormat: 'json',
      logIncludeOpened: true,
    });

    console.log('Selected goal:', response.goal);
    response.rounds.forEach((round, idx) => {
      console.log(`\nRound ${idx + 1}`);
      console.log('Query:', round.query);
      console.log('Hits:', round.hits, 'Score:', round.score.toFixed(2));
      console.log('Top result:', round.response.results[0]?.title || '(none)');
    });
  } catch (error) {
    console.error('adaptive search failed:', error);
  } finally {
    await rpa.closeBrowser();
  }
}

adaptiveSearchExample();
