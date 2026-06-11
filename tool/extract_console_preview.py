import io, re, json

src = io.open('supabase/functions/notify-lead/console.ts', encoding='utf-8').read()
m = re.search(r'export function renderConsoleHtml\([^)]*\): string \{\s*return `(.*)`;\s*\}\s*$', src, re.S)
html = m.group(1)
# Unescape TS template escapes: \` -> `, \\ -> \  (do backslash last)
html = html.replace(chr(92) + '`', '`')
html = html.replace(chr(92) + chr(92), chr(92))

mock = {
  "ok": True, "rep": {"name": "דנה"},
  "today": [
    {"id": "a"*8, "name": "ישראל ישראלי", "phone": "0501234567", "provider": "הוט", "meetingDate": "2026-06-16", "slot": "14:30", "startsAt": "2026-06-16T11:30:00Z", "status": "confirmed", "joinUrl": "https://zoom.us/j/123"},
    {"id": "b"*8, "name": "מאיה כהן", "phone": "0529876543", "provider": "בזק", "meetingDate": "2026-06-16", "slot": "16:00", "startsAt": "2026-06-16T13:00:00Z", "status": "pending", "joinUrl": None},
  ],
  "pending": [
    {"id": "b"*8, "name": "מאיה כהן", "phone": "0529876543", "provider": "בזק", "meetingDate": "2026-06-16", "slot": "16:00", "startsAt": "2026-06-16T13:00:00Z", "status": "pending", "joinUrl": None},
    {"id": "c"*8, "name": "אבי לוי", "phone": "0541112233", "provider": "yes", "meetingDate": "2026-06-17", "slot": "10:30", "startsAt": "2026-06-17T07:30:00Z", "status": "pending", "joinUrl": None},
  ],
  "week": [
    {"id": "a"*8, "name": "ישראל ישראלי", "phone": "0501234567", "provider": "הוט", "meetingDate": "2026-06-16", "slot": "14:30", "startsAt": "2026-06-16T11:30:00Z", "status": "confirmed", "joinUrl": "https://zoom.us/j/123"},
    {"id": "d"*8, "name": "נועה ברק", "phone": "0506667788", "provider": "פרטנר", "meetingDate": "2026-06-18", "slot": "12:00", "startsAt": "2026-06-18T09:00:00Z", "status": "confirmed", "joinUrl": "https://zoom.us/j/456"},
  ],
  "stats": {"today": 2, "pending": 2, "week": 2},
}
needle = '${mockJson ?? "null"}'
html = html.replace(needle, json.dumps(mock, ensure_ascii=False))
io.open('build/rep-console-preview.html', 'w', encoding='utf-8', newline='').write(html)
print('preview written; length', len(html), '| mock injected:', needle not in html)
