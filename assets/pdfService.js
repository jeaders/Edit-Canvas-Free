console.log('>>> pdfService.js module EXECUTING')

// use globals loaded from CDN
const PDFLib = window.PDFLib
const pdfjsLib = window.pdfjsLib

// configure worker (CDN)
if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  console.log('✓ pdfService: PDF.js worker configured')
} else {
  console.warn('[pdfService] pdfjsLib not available for worker config', pdfjsLib)
}

const PdfService = {
  async mergePdfs(list) {
    const out = await PDFLib.PDFDocument.create()
    for (const bytes of list) {
      const src = await PDFLib.PDFDocument.load(bytes)
      const pages = await out.copyPages(src, src.getPageIndices())
      for (const p of pages) out.addPage(p)
    }
    const b = await out.save()
    return new Uint8Array(b)
  },
  async extractPages(bytes, pageNumbers) {
    const src = await PDFLib.PDFDocument.load(bytes)
    const out = await PDFLib.PDFDocument.create()
    const indices = pageNumbers.map(n => n - 1)
    const pages = await out.copyPages(src, indices)
    for (const p of pages) out.addPage(p)
    const b = await out.save()
    return new Uint8Array(b)
  },
  async rotatePages(bytes, pageNumbers, degrees) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    for (const n of pageNumbers) {
      const page = doc.getPage(n - 1)
      page.setRotation(PDFLib.degrees(degrees))
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },
  async reorderPages(bytes, order) {
    const src = await PDFLib.PDFDocument.load(bytes)
    const out = await PDFLib.PDFDocument.create()
    const indices = order.map(n => n - 1)
    const pages = await out.copyPages(src, indices)
    for (const p of pages) out.addPage(p)
    const b = await out.save()
    return new Uint8Array(b)
  },
  async applyAnnotations(bytes, annotations) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica)
    const entries = Object.entries(annotations)
    for (const [key, annots] of entries) {
      const n = parseInt(key, 10)
      const page = doc.getPage(n - 1)
      const { width, height } = page.getSize()
      for (const a of annots) {
        if (a.type === 'text' || a.type === 'ocrText') {
          page.drawText(a.text, { x: a.x, y: height - a.y - a.size, size: a.size || 12, font, color: PDFLib.rgb(...PdfService.hexToRgb01(a.color || '#000')) })
        } else if (a.type === 'highlight') {
          const rgb = PdfService.hexToRgb01(a.color || '#ffeb3b')
          page.drawRectangle({ x: a.x, y: height - a.y - a.h, width: a.w, height: a.h, color: PDFLib.rgb(rgb[0], rgb[1], rgb[2]), opacity: 0.25 })
        } else if (a.type === 'redact') {
          page.drawRectangle({ x: a.x, y: height - a.y - a.h, width: a.w, height: a.h, color: PDFLib.rgb(1, 1, 1) })
        } else if (a.type === 'replace') {
          page.drawRectangle({ x: a.x, y: height - a.y - a.h, width: a.w, height: a.h, color: PDFLib.rgb(1, 1, 1) })
          page.drawText(a.text, { x: a.x + 4, y: height - a.y - (a.size + 4), size: a.size || 12, font, color: PDFLib.rgb(...PdfService.hexToRgb01(a.color || '#000')) })
        }
      }
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },
  async applyTextEdits(bytes, textEdits, pageScale) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    const entries = Object.entries(textEdits || {})

    // Cache for embedded fonts to avoid duplicate embedding
    const fontCache = {}

    for (const [key, edits] of entries) {
      const n = parseInt(key, 10)
      const page = doc.getPage(n - 1)
      const { height } = page.getSize()
      const scale = pageScale[n - 1] || 1

      for (const e of Object.values(edits)) {
        const bleed = 5.0
        const m = e.origRect || e.rect
        const mxPt = m.x / scale - bleed
        const myTopPt = m.y / scale - bleed
        const mwPt = m.w / scale + (bleed * 2)
        const mhPt = m.h / scale + (bleed * 2)
        const myPt = height - myTopPt - mhPt
        page.drawRectangle({ x: mxPt, y: myPt, width: mwPt, height: mhPt, color: PDFLib.rgb(1, 1, 1) })

        if (!e.erase && e.text.trim()) {
          const fontName = PdfService._getFontVariant(e.font || 'Helvetica', !!e.bold, !!e.italic)
          if (!fontCache[fontName]) {
            fontCache[fontName] = await doc.embedFont(PDFLib.StandardFonts[fontName])
          }
          const activeFont = fontCache[fontName]
          const xPt = e.rect.x / scale
          const yTopPt = e.rect.y / scale
          const hPt = e.rect.h / scale
          const yPt = height - yTopPt - hPt
          const finalSize = e.size || Math.max(8, hPt * 0.75)
          const rgb = PdfService.hexToRgb01(e.color || '#000000')

          page.drawText(e.text, {
            x: xPt,
            y: yPt + (hPt * 0.15),
            size: finalSize,
            font: activeFont,
            color: PDFLib.rgb(rgb[0], rgb[1], rgb[2])
          })
        }
      }
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },

  _getFontVariant(family, bold, italic) {
    const f = family.toLowerCase()
    if (f.includes('courier')) {
      if (bold && italic) return 'CourierBoldOblique'
      if (bold) return 'CourierBold'
      if (italic) return 'CourierOblique'
      return 'Courier'
    } else if (f.includes('times')) {
      if (bold && italic) return 'TimesRomanBoldItalic'
      if (bold) return 'TimesRomanBold'
      if (italic) return 'TimesRomanItalic'
      return 'TimesRoman'
    } else {
      // Default to Helvetica
      if (bold && italic) return 'HelveticaBoldOblique'
      if (bold) return 'HelveticaBold'
      if (italic) return 'HelveticaOblique'
      return 'Helvetica'
    }
  },
  async applyFreehandDrawings(bytes, drawings, pageScale) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    const entries = Object.entries(drawings || {})
    for (const [key, paths] of entries) {
      const n = parseInt(key, 10)
      const page = doc.getPage(n - 1)
      const { height } = page.getSize()
      const scale = pageScale[n - 1] || 1
      for (const path of paths) {
        const rgb = PdfService.hexToRgb01(path.color)
        const pdfColor = PDFLib.rgb(rgb[0], rgb[1], rgb[2])
        for (let i = 0; i < path.points.length - 1; i++) {
          const p1 = path.points[i]
          const p2 = path.points[i + 1]
          page.drawLine({
            start: { x: p1.x / scale, y: height - (p1.y / scale) },
            end: { x: p2.x / scale, y: height - (p2.y / scale) },
            thickness: path.width / scale,
            color: pdfColor,
            lineCap: PDFLib.LineCapStyle.Round
          })
        }
      }
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },

  // convert simple vector shapes into the PDF (rectangles, circles, lines)
  async applyShapes(bytes, shapes, pageScale) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    const entries = Object.entries(shapes || {})
    for (const [key, list] of entries) {
      const n = parseInt(key, 10)
      if (n > doc.getPageCount()) continue
      const page = doc.getPage(n - 1)
      const { height } = page.getSize()
      const scale = pageScale[n - 1] || 1
      for (const s of list) {
        const rgb = PdfService.hexToRgb01(s.color || '#000000')
        const pdfColor = PDFLib.rgb(rgb[0], rgb[1], rgb[2])
        if (s.type === 'rect') {
          page.drawRectangle({
            x: s.x / scale,
            y: height - (s.y / scale) - (s.h / scale),
            width: s.w / scale,
            height: s.h / scale,
            borderColor: pdfColor,
            borderWidth: s.width / scale
          })
        } else if (s.type === 'circle') {
          const cx = (s.x + s.w / 2) / scale
          const cy = height - (s.y + s.h / 2) / scale
          const r = (Math.max(s.w, s.h) / 2) / scale
          page.drawEllipse({
            x: cx,
            y: cy,
            xScale: r,
            yScale: r,
            borderColor: pdfColor,
            borderWidth: s.width / scale
          })
        } else if (s.type === 'line') {
          const x1 = s.x / scale
          const y1 = height - (s.y / scale)
          const x2 = (s.x + s.w) / scale
          const y2 = height - ((s.y + s.h) / scale)
          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: s.width / scale,
            color: pdfColor
          })
        }
      }
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },
  async applyImages(bytes, imageAdds, pageScale) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    const entries = Object.entries(imageAdds || {})
    for (const [key, list] of entries) {
      const n = parseInt(key, 10)
      if (n > doc.getPageCount()) continue
      const page = doc.getPage(n - 1)
      const { height } = page.getSize()
      const scale = pageScale[n - 1] || 1
      for (const item of list) {
        try {
          const dataUrl = item.dataUrl
          const imageBytes = PdfService.dataUrlToUint8Array(dataUrl)
          let img
          if (dataUrl.includes('image/png')) {
            img = await doc.embedPng(imageBytes)
          } else {
            img = await doc.embedJpg(imageBytes)
          }
          const xPt = item.rect.x / scale
          const yTopPt = item.rect.y / scale
          const wPt = item.rect.w / scale
          const hPt = item.rect.h / scale
          const yPt = height - yTopPt - hPt
          page.drawImage(img, { x: xPt, y: yPt, width: wPt, height: hPt })
        } catch (e) {
          console.error('[Image Embed Error]', e)
        }
      }
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },
  async addWatermark(bytes, text) {
    const doc = await PDFLib.PDFDocument.load(bytes)
    const font = await doc.embedFont(PDFLib.StandardFonts.HelveticaBold)
    for (let i = 0; i < doc.getPageCount(); i++) {
      const page = doc.getPage(i)
      const { width, height } = page.getSize()
      page.drawText(text, {
        x: width / 4,
        y: height / 2,
        size: 48,
        font,
        color: PDFLib.rgb(0.9, 0.1, 0.4),
        rotate: PDFLib.degrees(-30),
        opacity: 0.15
      })
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },
  async compressByRaster(bytes, scale = 0.85) {
    const src = await pdfjsLib.getDocument({ data: bytes }).promise
    const doc = await PDFLib.PDFDocument.create()
    for (let i = 1; i <= src.numPages; i++) {
      const page = await src.getPage(i)
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = vp.width
      canvas.height = vp.height
      const ctx = canvas.getContext('2d')
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
      const jpg = await doc.embedJpg(dataUrl)
      const outPage = doc.addPage([jpg.width, jpg.height])
      outPage.drawImage(jpg, { x: 0, y: 0, width: jpg.width, height: jpg.height })
    }
    const b = await doc.save()
    return new Uint8Array(b)
  },
  hexToRgb01(hex) {
    const h = hex.replace('#', '')
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16) / 255, g = parseInt(h[1] + h[1], 16) / 255, b = parseInt(h[2] + h[2], 16) / 255;
      return [r, g, b]
    }
    const r = parseInt(h.substring(0, 2), 16) / 255
    const g = parseInt(h.substring(2, 4), 16) / 255
    const b = parseInt(h.substring(4, 6), 16) / 255
    return [r, g, b]
  },
  dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1]
    const bin = atob(base64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    return arr
  }
}

window.PdfService = PdfService
