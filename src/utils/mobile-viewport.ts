/** 手机软键盘缩小 visual viewport 或同时缩小布局时，供固定会话/浮层使用可见高度。 */
export function installMobileViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const mobile = window.matchMedia('(max-width:700px)');
  const root = document.documentElement;
  let frame = 0;
  let restingHeight = window.innerHeight;
  let restingWidth = window.innerWidth;
  const properties = ['--mobile-viewport-height', '--mobile-viewport-top', '--mobile-keyboard-inset'];

  function clear() {
    delete root.dataset.mobileKeyboard;
    properties.forEach(property => root.style.removeProperty(property));
  }

  function update() {
    frame = 0;
    const active = document.activeElement;
    const editable = active instanceof HTMLElement && (active.isContentEditable
      || active instanceof HTMLTextAreaElement && !active.disabled && !active.readOnly
      || active instanceof HTMLInputElement && !active.disabled && !active.readOnly
        && /^(text|search|email|url|tel|number|password)$/.test(active.type));
    if (!editable || restingWidth !== window.innerWidth) {
      restingHeight = window.innerHeight;
      restingWidth = window.innerWidth;
    } else {
      restingHeight = Math.max(restingHeight, window.innerHeight);
    }
    const inset = Math.max(0, window.innerHeight - viewport!.height - viewport!.offsetTop);
    const unscaledVisibleHeight = viewport!.height * viewport!.scale;
    // 还原缩放前的可见高度，纯缩放不当作键盘；定位仍使用真实 visual viewport。
    if (!mobile.matches || !editable || !Number.isFinite(unscaledVisibleHeight) || unscaledVisibleHeight <= 0
      || Math.max(restingHeight, window.innerHeight) - unscaledVisibleHeight < 120) {
      clear();
      return;
    }
    root.dataset.mobileKeyboard = 'true';
    root.style.setProperty(properties[0], `${viewport!.height}px`);
    root.style.setProperty(properties[1], `${viewport!.offsetTop}px`);
    root.style.setProperty(properties[2], `${inset}px`);
    const box = active.getBoundingClientRect();
    if (box.top < viewport!.offsetTop + 8 || box.bottom > viewport!.offsetTop + viewport!.height - 8) {
      active.scrollIntoView({ block:'nearest', inline:'nearest', behavior:'instant' });
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  mobile.addEventListener('change', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener('resize', schedule);
    viewport.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    mobile.removeEventListener('change', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', schedule);
    clear();
  };
}
