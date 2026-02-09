import { chromium, Browser, Page } from "playwright";
import type { Handler } from "aws-lambda";

interface ScrapingEvent {
  url: string;
  waitForSelector?: string;
  screenshot?: boolean;
  fullPage?: boolean;
  actions?: Array<{
    type: "click" | "type" | "wait";
    selector?: string;
    text?: string;
    timeout?: number;
  }>;
}

interface ScrapingResponse {
  statusCode: number;
  body: string;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  browserInstance = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
  });

  return browserInstance;
}

export const handler: Handler<ScrapingEvent, ScrapingResponse> = async (event) => {
  let page: Page | null = null;

  try {
    const { url, waitForSelector, screenshot = false, fullPage = true, actions = [] } = event;

    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "URL is required" }),
      };
    }

    // Get or create browser
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });

    page = await context.newPage();

    // Navigate to URL
    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for specific selector if provided
    if (waitForSelector) {
      console.log(`Waiting for selector: ${waitForSelector}`);
      await page.waitForSelector(waitForSelector, { timeout: 10000 });
    }

    // Execute actions
    for (const action of actions) {
      console.log(`Executing action: ${action.type}`);
      switch (action.type) {
        case "click":
          if (action.selector) {
            await page.click(action.selector);
          }
          break;
        case "type":
          if (action.selector && action.text) {
            await page.fill(action.selector, action.text);
          }
          break;
        case "wait":
          await page.waitForTimeout(action.timeout || 1000);
          break;
      }
    }

    // Get page data
    const title = await page.title();
    const content = await page.content();
    const currentUrl = page.url();

    // Take screenshot if requested
    let screenshotBase64: string | undefined;
    if (screenshot) {
      console.log("Taking screenshot...");
      const screenshotBuffer = await page.screenshot({
        fullPage,
        type: "png",
      });
      screenshotBase64 = screenshotBuffer.toString("base64");
    }

    // Close page and context
    await page.close();
    await context.close();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: {
          title,
          url: currentUrl,
          contentLength: content.length,
          screenshot: screenshotBase64,
        },
      }),
    };
  } catch (error) {
    console.error("Error during scraping:", error);

    if (page) {
      try {
        await page.close();
      } catch (closeError) {
        console.error("Error closing page:", closeError);
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    };
  }
};
