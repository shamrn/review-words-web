import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def normalize(item, index):
    if not isinstance(item, dict):
        raise ValueError(f'Record {index + 1}: expected an object')
    term = str(item.get('word') or item.get('phrase') or '').strip()
    translation = str(item.get('rus') or '').strip()
    if not term or not translation:
        raise ValueError(f'Record {index + 1}: term and translation are required')
    entry_id = item.get('entry_id', item.get('id'))
    if isinstance(entry_id, (int, float)):
        kind = 'phrase' if item.get('phrase') and not item.get('word') else 'word'
        entry_id = f'{kind}:{entry_id}'
    if entry_id is None or entry_id == '':
        entry_id = str(uuid.uuid4())
    repeat = item.get('next_repeat') or None
    if repeat:
        datetime.fromisoformat(repeat.replace('Z', '+00:00'))
    return {
        'id': str(entry_id), 'word': term,
        'transcription': str(item.get('transcription') or '').strip(),
        'rus': translation, 'next_repeat': repeat,
        'is_priority': item.get('is_priority') is True,
        'priority_countdown': max(0, int(item.get('priority_countdown') or 0)),
        'priority_due_counter': item.get('priority_due_counter'),
    }


def read_files(paths):
    rows = []
    seen = set()
    for path in paths:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
        if not isinstance(data, list):
            raise ValueError(f'{path}: expected a JSON array')
        for index, item in enumerate(data):
            row = normalize(item, index)
            if row['id'] in seen:
                raise ValueError(f'Duplicate entry ID: {row["id"]}')
            seen.add(row['id'])
            rows.append(row)
    return rows


def request(url, key, path, data, token=None, prefer=None):
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(url + path, data=json.dumps(data).encode(), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as error:
        body = json.loads(error.read())
        raise RuntimeError(body.get('msg') or body.get('message') or body.get('error_description') or f'HTTP {error.code}') from None


def main():
    parser = argparse.ArgumentParser(description='Import word and phrase JSON into your Supabase account.')
    parser.add_argument('files', nargs='*', type=Path)
    parser.add_argument('--url', default=os.environ.get('SUPABASE_URL'))
    parser.add_argument('--key', default=os.environ.get('SUPABASE_PUBLISHABLE_KEY'))
    parser.add_argument('--email', default=os.environ.get('SUPABASE_EMAIL'))
    parser.add_argument('--output', type=Path)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    paths = args.files or [ROOT / 'private/words_data.json', ROOT / 'private/phrases_data.json']
    rows = read_files(paths)
    print(f'Validated {len(rows)} records from {len(paths)} files.')
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'Combined file: {args.output}')
    if args.dry_run:
        return
    url = (args.url or input('Supabase project URL: ')).strip().rstrip('/')
    if urllib.parse.urlparse(url).scheme != 'https':
        raise ValueError('Use an HTTPS Supabase URL')
    key = args.key or getpass.getpass('Supabase publishable key: ')
    if key.startswith('sb_secret_'):
        raise ValueError('Use the publishable key')
    email = args.email or input('Account email: ').strip()
    password = getpass.getpass('Account password: ')
    session = request(url, key, '/auth/v1/token?grant_type=password', {'email': email, 'password': password})
    token = session['access_token']
    user_id = session['user']['id']
    added = 0
    for offset in range(0, len(rows), 200):
        batch = [{**{k: v for k, v in row.items() if k != 'id'}, 'entry_id': row['id'], 'user_id': user_id}
                 for row in rows[offset:offset + 200]]
        created = request(url, key, '/rest/v1/words?on_conflict=user_id,entry_id&select=entry_id', batch,
                          token=token, prefer='resolution=ignore-duplicates,return=representation')
        added += len(created)
        print(f'Processed {min(offset + 200, len(rows))}/{len(rows)}')
    print(f'Import complete. Added: {added}. Existing records and their progress were preserved.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
        print(f'Import failed: {error}', file=sys.stderr)
        sys.exit(1)
