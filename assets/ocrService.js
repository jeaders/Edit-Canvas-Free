const OcrService = {
  async ocrCanvas(canvas) {
    const dataUrl = canvas.toDataURL('image/png')
    const res = await Tesseract.recognize(dataUrl, 'ita+eng', { logger: () => {} })
    return res.data.text || ''
  }
}

window.OcrService = OcrService
