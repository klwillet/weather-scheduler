# weather-scheduler

A polished Vite + React + TypeScript PWA that combines Open-Meteo hourly weather with a **public Google Calendar**.

Live project-site target:

`https://klwillet.github.io/weather-scheduler/`

## Calendar setup

This version does **not** use Google OAuth. It reads the public Google Calendar configured in the app using the Google Calendar API.

Default calendar ID:

`gcorser@gmail.com`

The calendar must be public. Google says public calendars can be accessed by other applications and can be shared without requiring visitors to sign in. See Google's public-calendar help documentation for the required visibility setting.

The browser still needs a Google API key for the Calendar API request. The key is not a password or OAuth credential; restrict it to the Calendar API and the GitHub Pages web referrer.

For GitHub Pages, add the API key as an Actions repository secret named `VITE_GOOGLE_API_KEY`.

## Local development

```bash
npm install
npm run dev
```

For local use, copy `.env.example` to `.env` and put the API key in `VITE_GOOGLE_API_KEY`.

## Build

```bash
npm run build
```

## GitHub Pages

The included workflow builds the Vite app and deploys `dist` to GitHub Pages. The Vite base path is already configured as `/weather-scheduler/`.
