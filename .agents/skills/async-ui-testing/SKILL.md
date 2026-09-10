---
name: async-ui-testing
description: Use when testing frontend asynchronous UI, API integrations, loading skeletons, error boundaries, or slow network conditions in web applications
---

# Async UI Testing

Verify frontend states under real-world network latency, timeouts, and failure conditions. Never declare asynchronous UI complete based on instant localhost responses.

## Core Principle

Fast local APIs (5ms to 20ms) hide double-submit bugs, broken skeleton loaders, layout shifts, and unhandled errors. Every asynchronous UI feature requires visual proof across four states before completion.

## The 4-State Visual Protocol

Every data-fetching component, form action, or dashboard surface requires visual verification across four states:

| State | Condition | What to Inspect |
| :--- | :--- | :--- |
| **1. Loading** | Injected 3000ms latency | Button disabled, spinner or skeleton visible, zero layout shift (CLS) |
| **2. Error** | Injected HTTP 500 or offline | Clear error message, retry trigger present, no blank crash |
| **3. Empty** | Injected empty array (`[]`) | Informative placeholder with call-to-action, not blank space |
| **4. Settled** | Normal successful response | Final data cleanly formatted, interactive states responsive |

## Flow of Operations (Step-by-Step)

Follow this verification sequence before marking any async UI feature complete:

1. **Identify the target action and route:** locate the async trigger (such as a form submit or table search) and its underlying API endpoint.

2. **Pick a latency injection method:**
   - Choose **Method A (OMP Browser Relay)** for zero-code browser testing.
   - Choose **Method B (Dev Query Interceptor)** for URL-driven testing (`?__delay=3000`).

3. **Capture the in-flight loading state:**
   - Inject 3000ms delay.
   - Trigger the action by clicking the button or loading the page.
   - Capture a screenshot during the in-flight window.
   - Verify the trigger button stays disabled and the skeleton loader matches the final dimensions with zero layout shift.

4. **Capture the error state:**
   - Inject an HTTP 500 status or offline condition.
   - Trigger the action and capture a screenshot.
   - Verify a user-facing error message appears with a working retry button, with no blank screens or unhandled console errors.

5. **Capture the empty state:**
   - Return an empty data array (`[]`) or null payload.
   - Capture a screenshot.
   - Verify a helpful empty placeholder and call-to-action appear.

6. **Verify settled success:**
   - Remove latency and error overrides.
   - Capture a screenshot of the completed view.
   - Confirm final data renders cleanly without layout shifts.

---

## Execution Methods

Choose between zero-code browser throttling or surgical in-app request delays:

### Method A: OMP Browser Relay (CDP Emulation)

Use Chrome DevTools Protocol directly inside OMP browser evaluation to throttle network without modifying source code:

```javascript
const tab = await browser.open({ name: "qa", url: "http://localhost:5173", app: { relay: true } });

// Inject 3-second latency
await tab.run(async ({ page }) => {
  const client = await page.target().createCDPSession();
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 3000,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
});

// Trigger action, then capture in-flight loading state
await tab.click("#submit-button");
await tab.screenshot();
```

### Method B: Dev Query Interceptor (Surgical API Delay)

Add a development-only helper to your app HTTP client (`apiClient.ts`) to delay only data requests while keeping local bundle assets instant:

```typescript
const params = new URLSearchParams(window.location.search);
const delayMs = Number(params.get('__delay')) || 0;
const forceError = params.get('__error');

apiClient.interceptors.request.use(async (config) => {
  if (import.meta.env.DEV && delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (import.meta.env.DEV && forceError === '500') {
      return Promise.reject(new Error('Injected test failure'));
    }
    return Promise.reject(error);
  }
);
```

Test with URLs:

- `http://localhost:5173/pumps?__delay=3000` (inspect loading skeleton)
- `http://localhost:5173/pumps?__error=500` (inspect error boundary)

---

## Rationalization Table

| Excuse | Reality |
| :--- | :--- |
| "It works locally, so loading state is fine" | Fast localhost hides missing spinners, flickering skeletons, and double-click bugs. |
| "I read the code, error handling is present" | Code inspection misses unhandled promise rejections and broken container bounds. |
| "I do not need visual proof" | Without capturing the in-flight state, you cannot verify if inputs stay disabled during flight. |

## Red Flags

- Marking an async UI task complete without capturing a screenshot of the in-flight state.
- Buttons remaining active or clickable while an API request is in-flight.
- Spinners flashing for a fraction of a second without structured skeletons.
- Generic white screen rendered when an endpoint returns an empty array.
