export const JSON_CUSTOM_ICON_NAME = "json-custom-icon";
export const CIVITAI_ICON_NAME = "civitai-icon";
export const HUGGINGFACE_ICON_NAME = "huggingface-icon";
export const UNKNOWN_PROVIDER_ICON_NAME = "unknown-provider-icon";

// Use currentColor for the path fill to inherit Obsidian's text color
// Adjusted viewBox and path coordinates assuming original was 32x32, scaled to 100x100
export const JSON_CUSTOM_ICON_SVG = `<svg viewBox="0 0 100 100" width="100" height="100" xmlns="http://www.w3.org/2000/svg">
<path fill="currentColor" d="m96.875 34.375v31.25h-6.25l-6.25-18.75v18.75h-6.25v-31.25h6.25l6.25 18.75v-18.75z"/>
<path fill="currentColor" d="m66.667187 65.625h-8.334374a5.21375 5.21375 0 0 1 -5.208126-5.208125v-20.83375a5.21375 5.21375 0 0 1 5.208126-5.208125h8.334374a5.21375 5.21375 0 0 1 5.208125 5.208125v20.83375a5.21375 5.21375 0 0 1 -5.208125 5.208125zm-7.291874-6.25h6.25v-18.75h-6.25z"/>
<path fill="currentColor" d="m41.667188 65.625h-13.541875v-6.25h12.5v-6.25h-6.25a6.25625 6.25625 0 0 1 -6.25-6.25v-7.291875a5.21375 5.21375 0 0 1 5.208125-5.208125h13.541875v6.25h-12.5v6.25h6.25a6.25625 6.25625 0 0 1 6.25 6.25v7.291875a5.21375 5.21375 0 0 1 -5.208125 5.208125z"/>
<path fill="currentColor" d="m16.667188 65.625h-8.334375a5.21375 5.21375 0 0 1 -5.208126-5.208125v-7.291875h6.25v6.25h6.25v-25h6.25v26.041875a5.21375 5.21375 0 0 1 -5.208125 5.208125z"/>
</svg>`;

// CivitAI icon (official brand icon - adapted for Obsidian theming)
export const CIVITAI_ICON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="civitai-gradient-1" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#1281F4"/>
<stop offset="1" stop-color="#0821C6"/>
</linearGradient>
<linearGradient id="civitai-gradient-2" x1="12" y1="3.934" x2="12" y2="20.066" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#09138A"/>
<stop offset="1" stop-color="#150740"/>
</linearGradient>
</defs>
<path d="M12 0l10.392 6v12L12 24 1.608 18V6L12 0z" fill="url(#civitai-gradient-1)"/>
<path d="M12 3.934l6.985 4.033v8.066L12 20.065l-6.985-4.032V7.967L12 3.934z" fill="url(#civitai-gradient-2)"/>
<path d="M12 6.885l4.43 2.558v1.377h-2.386L12 9.64l-2.044 1.18v2.36L12 14.36l2.044-1.18h2.386v1.377L12 17.115l-4.43-2.558V9.443L12 6.885z" fill="#fff" fill-rule="evenodd"/>
</svg>`;

// HuggingFace icon (official brand icon - adapted for smaller sizes)
export const HUGGINGFACE_ICON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M2.25 11.535c0-3.407 1.847-6.554 4.844-8.258a9.822 9.822 0 019.687 0c2.997 1.704 4.844 4.851 4.844 8.258 0 5.266-4.337 9.535-9.687 9.535S2.25 16.8 2.25 11.535z" fill="#FF9D0B"/>
<path d="M11.938 20.086c4.797 0 8.687-3.829 8.687-8.551 0-4.722-3.89-8.55-8.687-8.55-4.798 0-8.688 3.828-8.688 8.55 0 4.722 3.89 8.55 8.688 8.55z" fill="#FFD21E"/>
<path d="M11.875 15.113c2.457 0 3.25-2.156 3.25-3.263 0-.576-.393-.394-1.023-.089-.582.283-1.365.675-2.224.675-1.798 0-3.25-1.693-3.25-.586 0 1.107.79 3.263 3.25 3.263h-.003z" fill="#FF323D"/>
<path d="M14.76 9.21c.32.108.445.753.767.585.447-.233.707-.708.659-1.204a1.235 1.235 0 00-.879-1.059 1.262 1.262 0 00-1.33.394c-.322.384-.377.92-.14 1.36.153.283.638-.177.925-.079l-.002.003zm-5.887 0c-.32.108-.448.753-.768.585a1.226 1.226 0 01-.658-1.204c.048-.495.395-.913.878-1.059a1.262 1.262 0 011.33.394c.322.384.377.92.14 1.36-.152.283-.64-.177-.925-.079l.003.003z" fill="#3A3B45"/>
<ellipse cx="17.812" cy="9.766" rx="0.813" ry="0.8" fill="#3A3B45"/>
<ellipse cx="6.188" cy="9.766" rx="0.813" ry="0.8" fill="#3A3B45"/>
</svg>`;

// Unknown provider icon (clean question mark)
export const UNKNOWN_PROVIDER_ICON_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.6"/>
<path fill="currentColor" opacity="0.8" d="M9.09 9c0-2.21 1.79-4 4-4 1.1 0 2.1.45 2.83 1.17S17 7.9 17 9c0 .88-.39 1.67-1 2.22-.61.55-1 1.37-1 2.28v.5h-2v-.5c0-1.38.56-2.63 1.46-3.54.45-.45.54-.68.54-1.46 0-.55-.45-1-1-1s-1 .45-1 1H9.09z"/>
<circle cx="12" cy="18.5" r="1" fill="currentColor" opacity="0.8"/>
</svg>`;
