import * as pdfjs from 'pdfjs-dist/build/pdf.js';
console.log('KEYS count', Object.keys(pdfjs).length);
console.log('HAS getDocument?', pdfjs.getDocument, 'type', typeof pdfjs.getDocument);
if (pdfjs.default) {
  console.log('default keys count', Object.keys(pdfjs.default).length);
  console.log('default.getDocument', pdfjs.default.getDocument, typeof pdfjs.default.getDocument);
}
