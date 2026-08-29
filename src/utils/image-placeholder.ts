const PRODUCT_IMAGE_PLACEHOLDER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" role="img" aria-label="暂无商品图片">
    <rect width="320" height="320" fill="#f2f3f5"/>
    <rect x="92" y="104" width="136" height="112" rx="12" fill="none" stroke="#c9cdd4" stroke-width="8"/>
    <circle cx="132" cy="140" r="13" fill="#c9cdd4"/>
    <path d="M104 196l38-38 27 27 18-18 29 29" fill="none" stroke="#c9cdd4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

export const PRODUCT_IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(PRODUCT_IMAGE_PLACEHOLDER_SVG)}`;

export function setImageFallback(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null;
  if (!image) return;
  const source = image.getAttribute('src') || image.currentSrc;
  if (image.dataset.fallbackSrc === source) return;
  image.dataset.fallbackSrc = source;
  image.src = PRODUCT_IMAGE_PLACEHOLDER;
}
