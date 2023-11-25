import { browser } from "k6/experimental/browser";

export const options = {
  scenarios: {
    browser: {
      executor: "constant-vus",
      exec: "browserTest",
      vus: 10,
      duration: "10s",
      options: {
        browser: {
          type: "chromium",
        },
      },
    },
  },
};

export async function browserTest() {
  const page = browser.newPage();

  try {
    // NOTE: You'll have to import the server.crt as trusted to run this
    await page.goto("https://localhost:3000/");
    // await page.locator("#testClick").click();
  } finally {
    page.close();
  }
}
