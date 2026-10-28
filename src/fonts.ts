// src/fonts.ts
// Fonts are registered from JS (rather than Fontsource's CSS) so the build can inline
// just the Latin files — the page has to work when opened straight from disk.
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import serif from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';
import serifItalic from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2?url';

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, '
  + 'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

const faces: [family: string, url: string, descriptors: FontFaceDescriptors][] = [
  ['Inter Variable', inter, { weight: '100 900' }],
  ['Instrument Serif', serif, { weight: '400' }],
  ['Instrument Serif', serifItalic, { weight: '400', style: 'italic' }],
];

for (const [family, url, descriptors] of faces) {
  document.fonts.add(new FontFace(family, `url(${url}) format('woff2')`, { display: 'swap', unicodeRange: LATIN, ...descriptors }));
}
