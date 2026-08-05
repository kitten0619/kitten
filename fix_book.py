import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 替换按钮
old_btn = 'onclick="setScreen(\'quiz\')">开始复习</button>'
# 注意：这里要用 JS 的 ===，但在 Python 字符串里直接写
new_btn_js = "onclick=\"startWrongReview()\" '+(state.wrong.length===0?'disabled':'')+'>开始错题复习 ('+state.wrong.length+')</button>"

content = content.replace(old_btn, new_btn_js)

# 替换熟悉度显示
old_small = '<small>KET 核心词</small>'
new_small_js = "<small>KET 核心词 · 熟悉度 '+(state.wrongMastery[id]||0)+'/3</small>"
content = content.replace(old_small, new_small_js)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
