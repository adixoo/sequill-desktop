/**
 * The installed Brave browser that Playwright drives for e2e tests and screenshot
 * captures. Set BRAVE_PATH if it lives somewhere else.
 */
export const BRAVE_PATH: string =
  process.env.BRAVE_PATH ?? "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe";
