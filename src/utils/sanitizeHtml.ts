const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'audio',
  'canvas',
  'picture',
  'svg',
  'math',
  'template',
  'noscript',
]);

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'strong',
  'em',
  'i',
  'u',
  's',
  'del',
  'p',
  'br',
  'span',
  'div',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'video',
  'source',
]);

const GLOBAL_ATTRS = new Set([
  'class',
  'title',
  'aria-label',
  'aria-hidden',
  'role',
  'dir',
  'lang',
  'style',
]);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding']),
  video: new Set([
    'src',
    'width',
    'height',
    'controls',
    'preload',
    'playsinline',
    'poster',
  ]),
  source: new Set(['src', 'type']),
};

const SAFE_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'white-space',
  'word-break',
  'overflow-wrap',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'width',
  'height',
  'max-width',
  'max-height',
  'min-width',
  'min-height',
  'display',
  'object-fit',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'border-style',
  'border-width',
  'border-radius',
]);

export function escapeHtml(text: string | number | undefined | null): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeUrl(value: string): boolean {
  const url = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  const lowerUrl = url.toLowerCase();

  if (!url) return false;
  if (lowerUrl.startsWith('//')) return false;
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('vbscript:') ||
    lowerUrl.startsWith('file:')
  ) {
    return false;
  }

  return (
    lowerUrl.startsWith('https://') ||
    lowerUrl.startsWith('http://') ||
    lowerUrl.startsWith('mailto:') ||
    lowerUrl.startsWith('tel:') ||
    lowerUrl.startsWith('/') ||
    lowerUrl.startsWith('#')
  );
}

function isSafeMediaUrl(value: string, mediaType: 'image' | 'video'): boolean {
  const url = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  const lowerUrl = url.toLowerCase();

  if (!url || lowerUrl.startsWith('//')) return false;
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('vbscript:') ||
    lowerUrl.startsWith('file:')
  ) {
    return false;
  }

  if (lowerUrl.startsWith('https://') || lowerUrl.startsWith('http://')) {
    return true;
  }

  if (lowerUrl.startsWith('blob:')) {
    return true;
  }

  return (
    mediaType === 'image' &&
    /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(lowerUrl)
  );
}

function sanitizeStyle(styleValue: string): string {
  const declarations = styleValue
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  const safeDeclarations: string[] = [];

  declarations.forEach((declaration) => {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex <= 0) return;

    const prop = declaration.slice(0, colonIndex).trim().toLowerCase();
    const value = declaration.slice(colonIndex + 1).trim();
    const normalizedValue = value
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, '')
      .toLowerCase();

    if (!SAFE_STYLE_PROPS.has(prop)) return;
    if (
      normalizedValue.includes('url(') ||
      normalizedValue.includes('image-set(') ||
      normalizedValue.includes('expression(') ||
      normalizedValue.includes('@import') ||
      normalizedValue.includes('javascript:') ||
      normalizedValue.includes('vbscript:') ||
      normalizedValue.includes('data:') ||
      normalizedValue.includes('behavior:') ||
      normalizedValue.includes('\\')
    ) {
      return;
    }

    safeDeclarations.push(`${prop}: ${value}`);
  });

  return safeDeclarations.join('; ');
}

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

function sanitizeElement(el: Element) {
  const tagName = el.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tagName)) {
    el.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    unwrapElement(el);
    return;
  }

  Array.from(el.attributes).forEach((attr) => {
    const attrName = attr.name.toLowerCase();
    const attrValue = attr.value;
    const allowedAttrs = TAG_ATTRS[tagName];
    const isAllowedAttr =
      GLOBAL_ATTRS.has(attrName) ||
      attrName.startsWith('data-') ||
      Boolean(allowedAttrs?.has(attrName));

    if (
      attrName.startsWith('on') ||
      attrName === 'srcdoc' ||
      attrName.includes(':') ||
      !isAllowedAttr
    ) {
      el.removeAttribute(attr.name);
      return;
    }

    if (attrName === 'style') {
      const safeStyle = sanitizeStyle(attrValue);
      if (safeStyle) {
        el.setAttribute('style', safeStyle);
      } else {
        el.removeAttribute(attr.name);
      }
      return;
    }

    if (attrName === 'href' && !isSafeUrl(attrValue)) {
      el.removeAttribute(attr.name);
      return;
    }

    if (tagName === 'img' && attrName === 'src' && !isSafeMediaUrl(attrValue, 'image')) {
      el.removeAttribute(attr.name);
      return;
    }

    if (
      tagName === 'video' &&
      (attrName === 'src' || attrName === 'poster') &&
      !isSafeMediaUrl(attrValue, attrName === 'poster' ? 'image' : 'video')
    ) {
      el.removeAttribute(attr.name);
      return;
    }

    if (tagName === 'source' && attrName === 'src' && !isSafeMediaUrl(attrValue, 'video')) {
      el.removeAttribute(attr.name);
      return;
    }
  });

  if (tagName === 'a') {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer nofollow');
  }

  if (tagName === 'img') {
    const img = el as HTMLImageElement;
    img.loading = 'lazy';
    img.decoding = 'async';
  }

  if (tagName === 'video') {
    el.removeAttribute('autoplay');
    el.setAttribute('controls', '');
    el.setAttribute('preload', 'none');
    el.setAttribute('playsinline', '');
  }

}

// 通用 HTML 清洗函数：去除脚本/事件/危险标签，规范链接与媒体属性
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return '';
  if (typeof document === 'undefined') return escapeHtml(html);
  try {
    const doc = document.implementation.createHTMLDocument('xhunt-sanitize');
    doc.body.innerHTML = html;

    const elements = Array.from(doc.body.querySelectorAll('*'));
    elements.forEach(sanitizeElement);

    return doc.body.innerHTML;
  } catch (error) {
    console.log('Error sanitizing HTML:', error);
    return '';
  }
}
