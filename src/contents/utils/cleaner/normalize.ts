export function normalizeTweetText(rawText: string): {
  normalized: string;
  stripped: string;
} {
  if (!rawText) return { normalized: '', stripped: '' };

  // 1. Unicode NFKC 归一化 (将全角字符转为标准 ASCII)
  const normalized = rawText.normalize('NFKC');

  // 2. 剥离不可见字符（零宽字符、Word Joiner U+2060-U+2064、软连字符等）与常见干扰标点
  const stripped = normalized
    .replace(/[\u200B-\u200D\u2060-\u2064\u00AD\uFEFF]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[·.。_—―–\-\s\/\*\+➕\^#@~〜～!！\?？,，:：;；"'`“”‘’「」『』\(\)（）\[\]【】\{\}<>《》|\\/、…•]+/gu, '')
    .toLowerCase();

  return { normalized, stripped };
}
