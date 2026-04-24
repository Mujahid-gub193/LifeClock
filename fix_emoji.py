import os

path = r'D:/life cycle/sleep.js'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "function qualEmoji(q) { return ['','",
    "function qualEmoji(q) { return ['','Poor','Fair','Okay','Good','Great'][q] || ''; } // was: ['','"
)
# simpler: just replace the whole function
import re
c = re.sub(
    r"function qualEmoji\(q\) \{ return \[.*?\]\[q\] \|\| ''; \}",
    "function qualEmoji(q) { return ['','Poor','Fair','Okay','Good','Great'][q] || ''; }",
    c
)
c = c.replace('${qualEmoji(l.quality)} ${l.quality}/5', '${qualEmoji(l.quality)} (${l.quality}/5)')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
