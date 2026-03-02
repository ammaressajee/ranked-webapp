# AdSense setup

Your AdSense script is already in the app (client ID: `ca-pub-5902015783807243`). To show ads you need to create **ad units** and add their slot IDs.

## 1. Create ad units in AdSense

1. Go to [Google AdSense](https://www.google.com/adsense/) → **Ads** → **By ad unit**.
2. Click **Create ad unit**.
3. Choose **Display ads** → **Responsive** (recommended).
4. Create two units (you can name them for clarity):
   - **Footer** – used in the app footer on most pages.
   - **In-content** – used as a card on the Home page.
5. After creating each unit, open it and copy the **Ad unit ID** (a number like `1234567890`). That is your **slot ID**.

## 2. Add slot IDs in the app

In [src/environments/environment.ts](src/environments/environment.ts) (production), set:

- `adSlotFooter`: paste the slot ID of your **Footer** ad unit.
- `adSlotInContent`: paste the slot ID of your **In-content** ad unit.

Example (with fake IDs):

```ts
adSlotFooter: '1234567890',
adSlotInContent: '0987654321',
```

Save, rebuild, and deploy. Ads will appear in:

- **Footer**: a slim bar above the copyright on all pages except Login and League join.
- **Home**: one card-style block after the main content on the home page.

## 3. Development

Ads are disabled in development (`adsEnabled: false` in `environment.development.ts`). No slot IDs are needed for local runs.
