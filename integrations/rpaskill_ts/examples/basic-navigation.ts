import RPASkill from '../src/index';

async function basicNavigationExample() {
  const rpa = new RPASkill();
  
  try {
    // 初始化浏览器
    await rpa.initBrowser({
      headless: false,
      viewport: {
        width: 1920,
        height: 1080,
      },
    });
    
    console.log('浏览器初始化完成');
    
    // 打开网页
    await rpa.navigate('https://example.com');
    console.log('已打开 https://example.com');
    
    // 获取页面标题和URL
    const title = await rpa.getTitle();
    const url = await rpa.getUrl();
    console.log(`页面标题: ${title}`);
    console.log(`当前URL: ${url}`);
    
    // 等待页面加载完成
    await rpa.waitForLoadState('networkidle');
    console.log('页面加载完成');
    
    // 刷新页面
    console.log('刷新页面...');
    await rpa.refresh();
    await rpa.waitForLoadState('networkidle');
    console.log('页面刷新完成');
    
    // 导航到其他页面
    console.log('导航到 Google...');
    await rpa.navigate('https://google.com');
    await rpa.waitForLoadState('networkidle');
    console.log('已打开 Google');
    
    // 后退到上一页
    console.log('后退到上一页...');
    await rpa.goBack();
    await rpa.waitForLoadState('networkidle');
    console.log('已后退到上一页');
    
    // 前进到下一页
    console.log('前进到下一页...');
    await rpa.goForward();
    await rpa.waitForLoadState('networkidle');
    console.log('已前进到下一页');
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    // 关闭浏览器
    await rpa.closeBrowser();
    console.log('浏览器已关闭');
  }
}

basicNavigationExample();
