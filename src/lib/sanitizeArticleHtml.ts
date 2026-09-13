import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 's', 'del', 'mark',
  'ul', 'ol', 'li',
  'pre', 'code', 'kbd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'img', 'figure', 'figcaption',
  'sup', 'sub', 'details', 'summary',
];

export function sanitizeArticleHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      code: ['class'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    allowedClasses: {
      code: ['language-*'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data'],
    },
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    transformTags: {
      // 正文标题降一级：页面 h1 已被文章标题占用，正文 h1→h2, h2→h3 … h5→h6, h6 保留
      h1: (_tagName, attribs) => ({ tagName: 'h2', attribs }),
      h2: (_tagName, attribs) => ({ tagName: 'h3', attribs }),
      h3: (_tagName, attribs) => ({ tagName: 'h4', attribs }),
      h4: (_tagName, attribs) => ({ tagName: 'h5', attribs }),
      h5: (_tagName, attribs) => ({ tagName: 'h6', attribs }),
      a: (_tagName, attribs) => {
        const href = attribs.href || '';
        const isExternal = /^https?:\/\//i.test(href);
        const { target: _target, rel: _rel, ...safeAttribs } = attribs;
        return {
          tagName: 'a',
          attribs: isExternal
            ? { ...safeAttribs, target: '_blank', rel: 'noopener noreferrer' }
            : safeAttribs,
        };
      },
    },
  });
}
