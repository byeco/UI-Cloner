if (!window.__OMNITAB_INSPECTOR_LOADED__) {
  window.__OMNITAB_INSPECTOR_LOADED__ = true;

  const HIGHLIGHT_ID = 'byeco-ui-cloner-highlight';
  const BADGE_ID = 'byeco-ui-cloner-badge';
  let hoveredElement = null;
  let inspectionEnabled = false;

  function getHighlightElements() {
    let highlight = document.getElementById(HIGHLIGHT_ID);
    let badge = document.getElementById(BADGE_ID);

    if (!highlight) {
      highlight = document.createElement('div');
      highlight.id = HIGHLIGHT_ID;
      Object.assign(highlight.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483646',
        border: '2px solid #22d3ee',
        background: 'rgba(34, 211, 238, 0.12)',
        borderRadius: '2px',
        transition: 'all 60ms ease-out',
        boxShadow: '0 0 0 1px rgba(2,8,20,0.5)'
      });
      document.documentElement.appendChild(highlight);
    }

    if (!badge) {
      badge = document.createElement('div');
      badge.id = BADGE_ID;
      Object.assign(badge.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483647',
        background: '#0b1628',
        color: '#e6f0fa',
        border: '1px solid #22d3ee',
        borderRadius: '4px',
        padding: '2px 7px',
        fontSize: '11px',
        fontFamily: 'Consolas, Monaco, monospace',
        lineHeight: '1.4',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
      });
      document.documentElement.appendChild(badge);
    }

    return { highlight, badge };
  }

  function highlight(element) {
    if (!element || element.id === HIGHLIGHT_ID || element.id === BADGE_ID) return;
    const rect = element.getBoundingClientRect();
    const { highlight: overlay, badge } = getHighlightElements();

    overlay.style.display = 'block';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    const tagName = element.tagName.toLowerCase();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    const childCount = element.children.length;
    const childLabel = childCount > 0 ? ` [${childCount} children]` : '';
    badge.textContent = `<${tagName}> ${width} × ${height}px${childLabel}`;

    let badgeTop = rect.top - 24;
    if (badgeTop < 4) badgeTop = rect.bottom + 4;
    let badgeLeft = Math.max(4, rect.left);

    badge.style.display = 'block';
    badge.style.top = `${badgeTop}px`;
    badge.style.left = `${badgeLeft}px`;
  }

  function hideHighlight() {
    const highlightEl = document.getElementById(HIGHLIGHT_ID);
    const badgeEl = document.getElementById(BADGE_ID);
    if (highlightEl) highlightEl.style.display = 'none';
    if (badgeEl) badgeEl.style.display = 'none';
  }

  function stopInspection() {
    inspectionEnabled = false;
    hideHighlight();
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      stopInspection();
      try {
        chrome.runtime.sendMessage({ type: 'INSPECTION_CANCELLED' });
      } catch {}
    }
  }

  function onMouseMove(event) {
    if (!inspectionEnabled || event.target.id === HIGHLIGHT_ID || event.target.id === BADGE_ID) return;
    hoveredElement = event.target;
    highlight(hoveredElement);
  }

  function getCleanHtmlSnippet(element, maxLength = 2500) {
    try {
      const clone = element.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, iframe, #' + HIGHLIGHT_ID + ', #' + BADGE_ID).forEach((el) => el.remove());
      clone.querySelectorAll('*').forEach((el) => el.removeAttribute('style'));
      clone.removeAttribute('style');
      let html = clone.outerHTML || '';
      html = html.replace(/\s+/g, ' ').trim();
      if (html.length > maxLength) {
        // Etiketi ortadan bölme: son tam kapanan tag'de kes.
        const cut = html.lastIndexOf('>', maxLength);
        html = (cut > maxLength * 0.5 ? html.slice(0, cut + 1) : html.slice(0, maxLength)) + '<!-- truncated -->';
        return html;
      }
      return html;
    } catch {
      return '';
    }
  }

  function serializeNode(node, currentDepth = 0, maxDepth = 3, state = { count: 0, maxCount: 25 }) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    if (node.id === HIGHLIGHT_ID || node.id === BADGE_ID) return null;
    if (state.count >= state.maxCount) return null;
    state.count++;

    const tag = node.tagName.toLowerCase();
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);

    let directText = '';
    for (const childNode of node.childNodes) {
      if (childNode.nodeType === Node.TEXT_NODE) {
        const t = childNode.textContent?.trim();
        if (t) directText += (directText ? ' ' : '') + t;
      }
    }

    const attrs = {};
    for (const attr of node.attributes) {
      if (['id', 'class', 'href', 'src', 'alt', 'type', 'placeholder', 'role', 'aria-label', 'name', 'title'].includes(attr.name)) {
        attrs[attr.name] = attr.value;
      }
    }

    const serialized = {
      tagName: tag,
      text: directText.slice(0, 100),
      attributes: attrs,
      dimensions: { width: Math.round(rect.width), height: Math.round(rect.height) },
      style: {
        display: style.display,
        position: style.position,
        flexDirection: style.flexDirection,
        justifyContent: style.justifyContent,
        alignItems: style.alignItems,
        gap: style.gap,
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        padding: style.padding,
        margin: style.margin,
        borderRadius: style.borderRadius,
        border: style.border,
        boxShadow: style.boxShadow
      },
      children: []
    };

    if (currentDepth < maxDepth && node.children.length > 0) {
      for (const child of node.children) {
        const childData = serializeNode(child, currentDepth + 1, maxDepth, state);
        if (childData) serialized.children.push(childData);
      }
    }

    return serialized;
  }

  function onClick(event) {
    if (!inspectionEnabled || event.target.id === HIGHLIGHT_ID || event.target.id === BADGE_ID) return;
    event.preventDefault();
    event.stopPropagation();

    const target = event.target;
    const style = getComputedStyle(target);
    const rect = target.getBoundingClientRect();
    const attributes = Array.from(target.attributes ?? []).reduce((result, attribute) => {
      if (attribute.name !== 'style') result[attribute.name] = attribute.value;
      return result;
    }, {});

    // Serialize full child tree and sanitized HTML snippet
    const treeState = { count: 0, maxCount: 25 };
    const serializedTree = serializeNode(target, 0, 3, treeState);
    const htmlSnippet = getCleanHtmlSnippet(target);

    try {
      chrome.runtime.sendMessage({
        type: 'ELEMENT_SELECTED',
        payload: {
          tagName: target.tagName.toLowerCase(),
          text: target.textContent?.trim().slice(0, 120) ?? '',
          selector: getSelector(target),
          attributes,
          dimensions: {
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          style: {
            backgroundColor: style.backgroundColor,
            color: style.color,
            borderRadius: style.borderRadius,
            padding: style.padding,
            margin: style.margin,
            border: style.border,
            boxShadow: style.boxShadow,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            display: style.display,
            position: style.position,
            gap: style.gap,
            flexDirection: style.flexDirection,
            justifyContent: style.justifyContent,
            alignItems: style.alignItems
          },
          children: serializedTree?.children || [],
          totalChildren: target.children.length,
          htmlSnippet,
          pageUrl: location.href,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            dpr: window.devicePixelRatio || 1
          }
        }
      });
    } catch (err) {
      console.error('Failed to send element selection:', err);
    }

    stopInspection();
  }

  function getSelector(element) {
    if (element.id) return `#${element.id}`;
    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 4) {
      let selector = current.tagName.toLowerCase();
      if (current.classList.length) selector += `.${Array.from(current.classList).slice(0, 2).join('.')}`;
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ pong: true });
      return true;
    }
    if (message.type === 'START_INSPECTION') {
      stopInspection();
      inspectionEnabled = true;
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
      sendResponse({ started: true });
      return true;
    }
    if (message.type === 'STOP_INSPECTION') {
      stopInspection();
      sendResponse({ stopped: true });
      return true;
    }
  });
}
