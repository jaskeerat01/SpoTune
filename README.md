# SpoTune

This repository currently contains the `src` folder migrated from OpenTune.

## What was imported

- `src/main.ts`
- `src/style.css`
- `src/api/lyrics.ts`
- `src/api/player.ts`
- `src/api/types.ts`
- `src/api/youtube.ts`

## Notes

- A basic sensitive-pattern scan was run before publishing.
- No obvious private keys or tokens were detected in the imported `src` files.

## Run locally

This repo currently includes source files only. To run it, place this `src` folder inside a Vite TypeScript app (or add the missing root files such as `package.json`, `index.html`, and `vite.config.ts`).

Typical commands in a Vite app:

```bash
npm install
npm run dev
```
