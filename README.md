# Word Review

A lightweight flashcard app for English words and phrases, with spaced repetition, speech playback, offline caching, and optional Supabase sync.

## Run

Serve the project over HTTP:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080`.

## Cloud sync

Run `schema.sql` in a Supabase project's SQL Editor. Enter the project URL and publishable key in the app's settings, then sign in. Each account can access only its own records through Row Level Security.

## Data

Import JSON backups through Settings. Multiple word and phrase files are supported. Imports add missing records without resetting existing progress.

For a command-line import, run `python3 scripts/import_data.py --help`. Personal datasets belong in the git-ignored `private/` directory.

## Checks

Requires Node.js 22 or newer:

```sh
npm install
npm test
```

## Deployment

The app is static and can be served from GitHub Pages. Publish the repository root with HTTPS enabled. No build step or server credentials are required.
