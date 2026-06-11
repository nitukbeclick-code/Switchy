import io, re
s = io.open('supabase/functions/notify-lead/console.ts', encoding='utf-8').read()
m = re.search(r'return `(.*)`;\s*\}\s*$', s, re.S)
body = m.group(1)
bt = body.count('`')
dollar = body.count('${')
print('backticks inside template body:', bt)
print('dollar-brace inside template body:', dollar)
# list each ${...}
for mm in re.finditer(r'\$\{[^}]*\}', body):
    print('  interp:', mm.group(0))
