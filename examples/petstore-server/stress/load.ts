import { browser } from "k6/experimental/browser";

// import { Rate } from "k6/metrics";

export const options = {
  scenarios: {
    browser: {
      executor: "shared-iterations",
      exec: "browserTest",
      vus: 50,
      iterations: 500,
      options: {
        browser: {
          type: "chromium",
        },
      },
    },
  },
};

// const myTrend = new Rate("failed_messages");

export async function browserTest() {
  const page = browser.newPage();

  try {
    // NOTE: You'll have to import the server.crt as trusted to run this
    await page.goto("https://localhost:3000/");
    await page.locator(`[name='testClick']`)?.click();
    // const text = page.locator(`[name='testMessage]`)?.innerText();
    // myTrend.add(text === "error");
  } finally {
    page.close();
  }
}
