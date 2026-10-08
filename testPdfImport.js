import * as pdfjs from 'pdfjs-dist/build/pdf.js';
console.log('pdfjs export keys:', Object.keys(pdfjs).slice(0,10));
console.log('getDocument type:', typeof pdfjs.getDocument);
