import { browserManager } from './browser.js';
import { ExtractOptions, TableData } from '../types.js';

export class Extractor {
  async extractText(selector: string, options: ExtractOptions = {}): Promise<string> {
    const page = await browserManager.getPage();
    return await page.textContent(selector) || '';
  }

  async extractAllText(selector: string, options: ExtractOptions = {}): Promise<string[]> {
    const page = await browserManager.getPage();
    const elements = await page.$$(selector);
    const texts: string[] = [];
    for (const element of elements) {
      const text = await element.textContent();
      texts.push(text || '');
    }
    return texts;
  }

  async extractAttribute(selector: string, attribute: string, options: ExtractOptions = {}): Promise<string> {
    const page = await browserManager.getPage();
    return await page.getAttribute(selector, attribute) || '';
  }

  async extractAllAttributes(selector: string, attribute: string, options: ExtractOptions = {}): Promise<string[]> {
    const page = await browserManager.getPage();
    const elements = await page.$$(selector);
    const attributes: string[] = [];
    for (const element of elements) {
      const attr = await element.getAttribute(attribute);
      attributes.push(attr || '');
    }
    return attributes;
  }

  async extractTable(selector: string, options: ExtractOptions = {}): Promise<TableData[]> {
    const page = await browserManager.getPage();
    
    const table = await page.$(selector);
    if (!table) {
      return [];
    }

    // 提取表头
    const headers = await table.$$('th');
    const headerTexts: string[] = [];
    for (const header of headers) {
      const text = await header.textContent();
      headerTexts.push(text?.trim() || '');
    }

    // 提取表格行
    const rows = await table.$$('tr');
    const tableData: TableData[] = [];

    // 跳过表头行
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = await row.$$('td');
      const rowData: TableData = {};

      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        const text = await cell.textContent();
        const header = headerTexts[j] || `column_${j}`;
        rowData[header] = text?.trim() || '';
      }

      if (Object.keys(rowData).length > 0) {
        tableData.push(rowData);
      }
    }

    return tableData;
  }

  async extractImage(selector: string, options: ExtractOptions = {}): Promise<string> {
    const page = await browserManager.getPage();
    const src = await page.getAttribute(selector, 'src');
    if (!src) {
      return '';
    }
    // 处理相对路径
    const url = new URL(src, page.url());
    return url.toString();
  }

  async extractAllImages(selector: string, options: ExtractOptions = {}): Promise<string[]> {
    const page = await browserManager.getPage();
    const elements = await page.$$(selector);
    const images: string[] = [];
    for (const element of elements) {
      const src = await element.getAttribute('src');
      if (src) {
        const url = new URL(src, page.url());
        images.push(url.toString());
      }
    }
    return images;
  }

  async extractPageSource(): Promise<string> {
    const page = await browserManager.getPage();
    return await page.content();
  }

  async extractTitle(): Promise<string> {
    const page = await browserManager.getPage();
    return await page.title();
  }

  async extractUrl(): Promise<string> {
    const page = await browserManager.getPage();
    return page.url();
  }

  async extractCookies(): Promise<Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: string }>> {
    const context = await browserManager.getContext();
    return await context.cookies();
  }

  async extractLocalStorage(): Promise<Record<string, string>> {
    const page = await browserManager.getPage();
    return await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          data[key] = localStorage.getItem(key) || '';
        }
      }
      return data;
    });
  }

  async extractSessionStorage(): Promise<Record<string, string>> {
    const page = await browserManager.getPage();
    return await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          data[key] = sessionStorage.getItem(key) || '';
        }
      }
      return data;
    });
  }
}

export const extractor = new Extractor();
