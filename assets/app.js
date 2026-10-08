// global scripts loaded from CDN (see index.html)
const PDFLib = window.PDFLib
const pdfjsLib = window.pdfjsLib

console.log('>>> app.js: PDFLib=', !!PDFLib, 'pdfjsLib=', !!pdfjsLib)

// global error handlers to surface issues during development
window.addEventListener('error', e => {
  console.error('[Global Error]', e.error || e.message, e)
  const status = document.getElementById('status')
  if (status) status.textContent = 'JS ERROR: ' + (e.error?.message || e.message)
})
window.addEventListener('unhandledrejection', e => {
  console.error('[Unhandled Rejection]', e.reason)
  const status = document.getElementById('status')
  if (status) status.textContent = 'PROMISE ERROR: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))
})

// check pdfjsLib immediately
if (!pdfjsLib || typeof pdfjsLib.getDocument !== 'function') {
  const msg = 'ERROR: pdfjsLib.getDocument NOT FOUND'
  console.error(msg)
  document.body.innerHTML = '<h1 style="color:red;">' + msg + '</h1><p>Check browser console for details</p>'
  throw new Error(msg)
}
console.log('✓ pdfjsLib.getDocument available')

// configure PDF.js worker path (use CDN for simplicity)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
console.log('✓ PDF.js worker configured')

const state = {
  pdfBytes: null,
  pdfDoc: null,
  pageCanvases: [],
  pageOrder: [],
  selectedPages: new Set(),
  annotations: {},
  annotMode: null,
  annotColor: '#ff3366',
  annotSize: 18
}

state.textEditMode = false
state.textEdits = {}
state.pageScale = []
state.imageAdds = {}
state.imageToPlace = null
state.zoom = 0.8
state.groupParagraphs = false
state.history = []
state.redo = []
state.currentPage = 1
state.isProcessing = false
state.selectedTextId = null // Track which text is being formatted
state.drawings = {} // { page: [ { points: [], color, width, mode } ] }
state.isDrawing = false
state.drawingMode = null // 'pen', 'eraser'
state.drawingStroke = { color: '#6e44ff', width: 3 }

// --- new Canva-style shape support ---
state.shapes = {}            // { page: [ {type, x,y,w,h,color,width} ] }
state.shapeMode = null       // 'rect','circle','line'
state.shapeColor = '#6e44ff'
state.shapeStrokeWidth = 3

state.currentFormatting = {
  font: 'Helvetica',
  size: 14,
  color: '#000000',
  bold: false,
  italic: false
}

const TEMPLATES = {
  blank: [],
  presentation: [
    { text: 'TITOLO DELLA TUA PRESENTAZIONE', x: 50, y: 300, size: 40, bold: true },
    { text: 'Un sottotitolo accattivante per il tuo progetto', x: 50, y: 360, size: 20 },
    { text: 'Presentato da: Il Tuo Nome', x: 50, y: 750, size: 14 }
  ],
  letter: [
    { text: 'Il Tuo Nome', x: 400, y: 50, size: 11 },
    { text: 'Via Roma 123, 00100 Roma', x: 400, y: 65, size: 11 },
    { text: 'Roma, ' + new Date().toLocaleDateString(), x: 400, y: 95, size: 11 },
    { text: 'Spett.le Azienda Destinataria', x: 50, y: 150, size: 11, bold: true },
    { text: 'Oggetto: Richiesta di informazioni per...', x: 50, y: 200, size: 12, bold: true },
    { text: 'Gentili signori,', x: 50, y: 250, size: 11 },
    { text: 'con la presente vorrei sottoporre alla vostra attenzione...', x: 50, y: 280, size: 11 },
    { text: 'In attesa di un vostro gentile riscontro, porgo cordiali saluti.', x: 50, y: 450, size: 11 },
    { text: 'Firma: ________________________', x: 50, y: 500, size: 11 }
  ],
  // ── CV Templates ──────────────────────────────────────────────────────────
  'cv-harvard': [
    { text: 'MARIO ROSSI', x: 50, y: 40, size: 22, bold: true, color: '#1a1a2e' },
    { text: 'Ingegnere del Software Senior', x: 50, y: 68, size: 13, color: '#374151' },
    { text: 'mario.rossi@email.com  •  +39 333 123 4567  •  LinkedIn: /in/mariorossi', x: 50, y: 86, size: 10, color: '#6b7280' },
    { text: '─────────────────────────────────────────────────────────────────', x: 50, y: 100, size: 9, color: '#d1d5db' },
    { text: 'ISTRUZIONE', x: 50, y: 118, size: 11, bold: true, color: '#1a1a2e' },
    { text: 'Laurea Magistrale in Informatica  —  Università La Sapienza, Roma', x: 50, y: 134, size: 11 },
    { text: '2015 – 2017  |  110/110 con lode', x: 50, y: 148, size: 10, color: '#6b7280' },
    { text: 'Laurea Triennale in Ingegneria Informatica  —  Politecnico di Milano', x: 50, y: 166, size: 11 },
    { text: '2012 – 2015  |  108/110', x: 50, y: 180, size: 10, color: '#6b7280' },
    { text: '─────────────────────────────────────────────────────────────────', x: 50, y: 194, size: 9, color: '#d1d5db' },
    { text: 'ESPERIENZA PROFESSIONALE', x: 50, y: 212, size: 11, bold: true, color: '#1a1a2e' },
    { text: 'Senior Software Engineer  —  TechCorp S.p.A., Milano', x: 50, y: 228, size: 11, bold: true },
    { text: 'Gennaio 2021 – Presente', x: 50, y: 242, size: 10, color: '#6b7280' },
    { text: '• Architettura e sviluppo di microservizi con Node.js e Kubernetes', x: 60, y: 258, size: 10 },
    { text: '• Riduzione del 40% dei tempi di risposta API tramite ottimizzazione', x: 60, y: 272, size: 10 },
    { text: '• Mentoring di 5 sviluppatori junior nel team', x: 60, y: 286, size: 10 },
    { text: 'Software Developer  —  StartupXYZ, Roma', x: 50, y: 306, size: 11, bold: true },
    { text: 'Marzo 2017 – Dicembre 2020', x: 50, y: 320, size: 10, color: '#6b7280' },
    { text: '• Sviluppo frontend con React e TypeScript', x: 60, y: 336, size: 10 },
    { text: '• Integrazione di API REST e GraphQL', x: 60, y: 350, size: 10 },
    { text: '─────────────────────────────────────────────────────────────────', x: 50, y: 368, size: 9, color: '#d1d5db' },
    { text: 'COMPETENZE', x: 50, y: 386, size: 11, bold: true, color: '#1a1a2e' },
    { text: 'Linguaggi: JavaScript, TypeScript, Python, Java, SQL', x: 50, y: 402, size: 10 },
    { text: 'Framework: React, Node.js, Express, Spring Boot, Django', x: 50, y: 416, size: 10 },
    { text: 'DevOps: Docker, Kubernetes, CI/CD, AWS, Git', x: 50, y: 430, size: 10 },
    { text: '─────────────────────────────────────────────────────────────────', x: 50, y: 448, size: 9, color: '#d1d5db' },
    { text: 'LINGUE', x: 50, y: 466, size: 11, bold: true, color: '#1a1a2e' },
    { text: 'Italiano (Madrelingua)  •  Inglese (C2 – IELTS 8.0)  •  Spagnolo (B2)', x: 50, y: 482, size: 10 }
  ],
  'cv-modern': [
    { text: 'GIULIA FERRARI', x: 200, y: 40, size: 26, bold: true, color: '#ffffff' },
    { text: 'UX/UI Designer & Product Manager', x: 200, y: 72, size: 13, color: '#e9d5ff' },
    { text: 'giulia.ferrari@email.com  •  +39 347 987 6543', x: 200, y: 90, size: 10, color: '#ddd6fe' },
    { text: 'PROFILO', x: 200, y: 130, size: 12, bold: true, color: '#7c3aed' },
    { text: 'Designer con 6 anni di esperienza nella creazione di', x: 200, y: 148, size: 10 },
    { text: 'interfacce intuitive e prodotti digitali di successo.', x: 200, y: 162, size: 10 },
    { text: 'ESPERIENZA', x: 200, y: 200, size: 12, bold: true, color: '#7c3aed' },
    { text: 'Lead UX Designer — DigitalAgency', x: 200, y: 218, size: 11, bold: true },
    { text: '2021 – Presente', x: 200, y: 232, size: 10, color: '#6b7280' },
    { text: '• Design system per 12 prodotti enterprise', x: 210, y: 248, size: 10 },
    { text: '• Aumento conversioni del 35% tramite A/B testing', x: 210, y: 262, size: 10 },
    { text: 'UX Designer — CreativeStudio', x: 200, y: 282, size: 11, bold: true },
    { text: '2018 – 2021', x: 200, y: 296, size: 10, color: '#6b7280' },
    { text: '• Progettazione di 20+ app mobile iOS e Android', x: 210, y: 312, size: 10 },
    { text: 'COMPETENZE', x: 200, y: 350, size: 12, bold: true, color: '#7c3aed' },
    { text: 'Figma  •  Sketch  •  Adobe XD  •  Protopie', x: 200, y: 368, size: 10 },
    { text: 'User Research  •  Wireframing  •  Usability Testing', x: 200, y: 382, size: 10 },
    { text: 'ISTRUZIONE', x: 200, y: 420, size: 12, bold: true, color: '#7c3aed' },
    { text: 'Laurea in Design della Comunicazione', x: 200, y: 438, size: 11 },
    { text: 'Politecnico di Milano  •  2018', x: 200, y: 452, size: 10, color: '#6b7280' }
  ],
  'cv-classic': [
    { text: 'LUCA BIANCHI', x: 50, y: 45, size: 20, bold: true, color: '#111827' },
    { text: 'Responsabile Marketing & Comunicazione', x: 50, y: 70, size: 12, color: '#374151' },
    { text: 'luca.bianchi@email.com  |  +39 320 456 7890  |  Milano, Italia', x: 50, y: 88, size: 10, color: '#6b7280' },
    { text: '══════════════════════════════════════════════════════════════', x: 50, y: 102, size: 8, color: '#374151' },
    { text: 'SOMMARIO PROFESSIONALE', x: 50, y: 118, size: 12, bold: true, color: '#111827' },
    { text: 'Professionista del marketing con 8 anni di esperienza nella gestione', x: 50, y: 136, size: 10 },
    { text: 'di campagne digitali e strategie di brand per aziende Fortune 500.', x: 50, y: 150, size: 10 },
    { text: '══════════════════════════════════════════════════════════════', x: 50, y: 166, size: 8, color: '#374151' },
    { text: 'ESPERIENZA LAVORATIVA', x: 50, y: 182, size: 12, bold: true, color: '#111827' },
    { text: 'Marketing Manager  |  GlobalBrand Italia  |  2019 – Presente', x: 50, y: 200, size: 11, bold: true },
    { text: '• Gestione budget marketing annuale di €2M', x: 60, y: 216, size: 10 },
    { text: '• Crescita del 60% del traffico organico in 18 mesi', x: 60, y: 230, size: 10 },
    { text: '• Coordinamento team di 8 persone tra creativi e analisti', x: 60, y: 244, size: 10 },
    { text: 'Digital Marketing Specialist  |  MediaGroup  |  2016 – 2019', x: 50, y: 264, size: 11, bold: true },
    { text: '• Campagne Google Ads e Meta Ads con ROI medio del 320%', x: 60, y: 280, size: 10 },
    { text: '• Gestione social media con 500K+ follower totali', x: 60, y: 294, size: 10 },
    { text: '══════════════════════════════════════════════════════════════', x: 50, y: 312, size: 8, color: '#374151' },
    { text: 'FORMAZIONE', x: 50, y: 328, size: 12, bold: true, color: '#111827' },
    { text: 'MBA in Marketing Management  —  SDA Bocconi, Milano  —  2016', x: 50, y: 346, size: 10 },
    { text: 'Laurea in Economia e Commercio  —  Università Bocconi  —  2014', x: 50, y: 360, size: 10 },
    { text: '══════════════════════════════════════════════════════════════', x: 50, y: 376, size: 8, color: '#374151' },
    { text: 'COMPETENZE CHIAVE', x: 50, y: 392, size: 12, bold: true, color: '#111827' },
    { text: 'SEO/SEM  •  Google Analytics  •  HubSpot  •  Salesforce  •  Adobe Suite', x: 50, y: 410, size: 10 },
    { text: 'Content Strategy  •  Brand Management  •  Data Analysis  •  Leadership', x: 50, y: 424, size: 10 }
  ],
  'cv-creative': [
    { text: '✦  SOFIA CONTI', x: 50, y: 50, size: 28, bold: true, color: '#ffffff' },
    { text: 'Graphic Designer & Art Director', x: 50, y: 82, size: 14, color: '#f3e8ff' },
    { text: 'sofia.conti@design.it  •  Behance: /sofiaconti  •  +39 366 789 0123', x: 50, y: 100, size: 10, color: '#e9d5ff' },
    { text: 'CHI SONO', x: 50, y: 145, size: 13, bold: true, color: '#7c3aed' },
    { text: 'Art Director con 7 anni di esperienza nel design editoriale,', x: 50, y: 163, size: 10 },
    { text: 'branding e comunicazione visiva. Appassionata di tipografia', x: 50, y: 177, size: 10 },
    { text: 'e design sostenibile.', x: 50, y: 191, size: 10 },
    { text: 'PORTFOLIO HIGHLIGHTS', x: 50, y: 220, size: 13, bold: true, color: '#7c3aed' },
    { text: '★  Rebranding completo per catena retail (50+ punti vendita)', x: 50, y: 238, size: 10 },
    { text: '★  Campagna ADV premiata al Cannes Lions 2022', x: 50, y: 252, size: 10 },
    { text: '★  Art direction per 3 copertine Vogue Italia', x: 50, y: 266, size: 10 },
    { text: 'ESPERIENZA', x: 50, y: 295, size: 13, bold: true, color: '#7c3aed' },
    { text: 'Art Director Senior  —  Studio Creativo Rosso, Milano', x: 50, y: 313, size: 11, bold: true },
    { text: '2020 – Presente', x: 50, y: 327, size: 10, color: '#9ca3af' },
    { text: 'Graphic Designer  —  Publicis Italia, Roma', x: 50, y: 347, size: 11, bold: true },
    { text: '2017 – 2020', x: 50, y: 361, size: 10, color: '#9ca3af' },
    { text: 'Junior Designer  —  Freelance', x: 50, y: 381, size: 11, bold: true },
    { text: '2016 – 2017', x: 50, y: 395, size: 10, color: '#9ca3af' },
    { text: 'STRUMENTI', x: 50, y: 424, size: 13, bold: true, color: '#7c3aed' },
    { text: 'Adobe Creative Suite  •  Figma  •  Cinema 4D  •  Blender', x: 50, y: 442, size: 10 },
    { text: 'After Effects  •  Premiere Pro  •  Procreate  •  Webflow', x: 50, y: 456, size: 10 },
    { text: 'ISTRUZIONE', x: 50, y: 485, size: 13, bold: true, color: '#7c3aed' },
    { text: 'Accademia di Belle Arti di Brera, Milano  —  2016', x: 50, y: 503, size: 10 },
    { text: 'Corso Avanzato Typography & Layout  —  Domus Academy  —  2017', x: 50, y: 517, size: 10 }
  ],
  'cv-minimal': [
    { text: 'ANDREA RUSSO', x: 50, y: 50, size: 24, bold: true, color: '#000000' },
    { text: 'Full Stack Developer', x: 50, y: 78, size: 12, color: '#6b7280' },
    { text: 'andrea.russo@dev.io  ·  github.com/andrearusso  ·  +39 345 678 9012', x: 50, y: 96, size: 9, color: '#9ca3af' },
    { text: '─', x: 50, y: 112, size: 9, color: '#e5e7eb' },
    { text: 'ABOUT', x: 50, y: 130, size: 10, bold: true, color: '#000000' },
    { text: 'Developer full stack con focus su performance e clean code.', x: 50, y: 146, size: 10, color: '#374151' },
    { text: '5 anni di esperienza in startup e scale-up tech.', x: 50, y: 160, size: 10, color: '#374151' },
    { text: 'WORK', x: 50, y: 190, size: 10, bold: true, color: '#000000' },
    { text: 'Senior Developer  ·  Fintech Startup  ·  2022–now', x: 50, y: 206, size: 10, color: '#374151' },
    { text: 'Full Stack Dev  ·  E-commerce Platform  ·  2020–2022', x: 50, y: 220, size: 10, color: '#374151' },
    { text: 'Junior Dev  ·  Web Agency  ·  2019–2020', x: 50, y: 234, size: 10, color: '#374151' },
    { text: 'SKILLS', x: 50, y: 264, size: 10, bold: true, color: '#000000' },
    { text: 'React  Next.js  Node.js  PostgreSQL  Redis  Docker  AWS', x: 50, y: 280, size: 10, color: '#374151' },
    { text: 'TypeScript  GraphQL  REST  TDD  Agile  Git', x: 50, y: 294, size: 10, color: '#374151' },
    { text: 'EDUCATION', x: 50, y: 324, size: 10, bold: true, color: '#000000' },
    { text: 'B.Sc. Computer Science  ·  Università di Bologna  ·  2019', x: 50, y: 340, size: 10, color: '#374151' },
    { text: 'LANGUAGES', x: 50, y: 370, size: 10, bold: true, color: '#000000' },
    { text: 'Italian (native)  ·  English (C1)  ·  German (B1)', x: 50, y: 386, size: 10, color: '#374151' }
  ]
};

function setStatus(t) {
  const el = document.getElementById('status')
  if (el) el.textContent = t
  console.log('[Status]', t)
}

function cloneBuffer(u8) {
  if (!u8 || !u8.buffer) return null
  if (u8.byteLength === 0) {
    console.warn('[Clone] Buffer is already detached or empty')
    return null
  }
  // Deep copy the underlying ArrayBuffer to prevent detachment issues
  return new Uint8Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength))
}

function isPdf(bytes) {
  if (!bytes || bytes.length < 5) return false
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4])
  console.log('[Buffer Check] Header:', header, 'Size:', bytes.length)
  return header === '%PDF-'
}

async function loadPdfFromBytes(bytes) {
  console.log('>> loadPdfFromBytes:', bytes?.length, 'bytes')
  if (state.isProcessing) {
    console.log('>> already processing, abort')
    return
  }
  state.isProcessing = true
  const lastValid = cloneBuffer(state.pdfBytes)

  try {
    if (!isPdf(bytes)) {
      throw new Error('Buffer non è un PDF valido (header: ' + String.fromCharCode(...bytes.slice(0, 5)) + ')')
    }
    console.log('\u2713 PDF header verified')

    state.pdfBytes = cloneBuffer(bytes)
    if (!state.pdfBytes) throw new Error('Impossibile clonare il buffer')
    console.log('\u2713 buffer cloned')

    console.log('>> calling pdfjsLib.getDocument')
    state.selectedPages.clear()
    state.annotations = {}
    setStatus('Caricamento PDF…')
    const dataToLoad = cloneBuffer(state.pdfBytes)
    let loadingTask
    try {
      loadingTask = pdfjsLib.getDocument({ data: dataToLoad })
    } catch (e) {
      console.error('>> pdfjsLib.getDocument threw synchronously:', e)
      throw e
    }
    const pdf = await loadingTask.promise
    console.log('\u2713 PDF.js loaded document, pages:', pdf.numPages)
    state.pdfDoc = pdf
    state.pageOrder = Array.from({ length: pdf.numPages }, (_, i) => i + 1)
    if (!window.RenderService || !window.RenderService.renderAllPages) throw new Error('RenderService non inizializzato')
    try {
      console.log('>> calling RenderService.renderAllPages...')
      await window.RenderService.renderAllPages(pdf, state.pageOrder)
      console.log('\u2713 renderAllPages completed')
    } catch (e) {
      console.error('>> renderAllPages error:', e)
      throw e
    }
    setStatus('PDF pronto')
  } catch (err) {
    console.error('>> loadPdfFromBytes error:', err.message)
    setStatus('Errore: ' + err.message)
    if (lastValid) {
      console.warn('>> restoring last valid PDF')
      state.pdfBytes = lastValid
    }
  } finally {
    state.isProcessing = false
  }
}

async function createNewPdf(templateType = 'blank') {
  if (state.pdfDoc && !confirm('Vuoi caricare un nuovo PDF? I lavori non salvati andranno persi.')) return
  setStatus('Creazione nuovo PDF...')
  const doc = await PDFLib.PDFDocument.create()
  doc.addPage([595.28, 841.89]) // A4 standard
  const bytes = await doc.save()

  state.textEdits = {}
  state.imageAdds = {}
  state.drawings = {}
  state.shapes = {}
  state.history = []

  if (templateType !== 'blank' && TEMPLATES[templateType]) {
    state.textEdits['1'] = {}
    TEMPLATES[templateType].forEach((it, i) => {
      const id = 'temp-' + Date.now() + '-' + i
      state.textEdits['1'][id] = {
        text: it.text,
        rect: { x: it.x, y: it.y, w: it.text.length * (it.size * 0.5), h: it.size * 1.2 },
        origRect: { x: it.x, y: it.y, w: 0, h: 0 },
        erase: false,
        size: it.size,
        bold: it.bold || false,
        color: '#000000',
        font: 'Helvetica'
      }
    })
  }

  await loadPdfFromBytes(new Uint8Array(bytes))
}

async function handleFileInput(files) {
  console.log('>> handleFileInput received', files ? files.length : 0, 'files')
  setStatus('Caricamento file in corso...')
  if (!files || files.length === 0) {
    console.log('>> no files, returning')
    return
  }

  const pdfs = []
  const imgs = []
  for (const f of files) {
    if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
      pdfs.push(f)
    } else if (f.type.startsWith('image/')) {
      imgs.push(f)
    }
  }
  console.log('>> classified:', pdfs.length, 'PDFs,', imgs.length, 'images')

  // if there is an existing document and user loads pdfs, ask confirmation
  if (pdfs.length > 0 && state.pdfBytes) {
    const ok = confirm('Vuoi caricare un nuovo PDF? I lavori non salvati andranno persi.')
    if (!ok) return
  }

  if (pdfs.length > 0) {
    if (pdfs.length === 1) {
      const bytes = new Uint8Array(await pdfs[0].arrayBuffer())
      await loadPdfFromBytes(bytes)
      return
    } else {
      const list = []
      for (const f of pdfs) {
        list.push(new Uint8Array(await f.arrayBuffer()))
      }
      // append converted images if any
      for (const img of imgs) {
        const data = await img.arrayBuffer()
        const pdfImg = await imageFileToPdf({ type: img.type, data: new Uint8Array(data) })
        list.push(pdfImg)
      }
      setStatus('Unione PDF…')
      const merged = await PdfService.mergePdfs(list)
      await loadPdfFromBytes(merged)
      return
    }
  }

  // if only images and no pdfs
  if (imgs.length && !pdfs.length && !state.pdfBytes) {
    const data = await imgs[0].arrayBuffer()
    const bytes = await imageFileToPdf({ type: imgs[0].type, data: new Uint8Array(data) })
    await loadPdfFromBytes(bytes)
    return
  }
}

function toggleSelection(pageNumber, checked) {
  if (checked) state.selectedPages.add(pageNumber)
  else state.selectedPages.delete(pageNumber)
}

function enableAnnotMode(mode) {
  state.annotMode = mode
  state.textEditMode = false // Conflict prevention
  state.drawingMode = null

  const layers = document.querySelectorAll('.annot-layer')
  layers.forEach(l => {
    if (mode) l.classList.add('annot-active')
    else l.classList.remove('annot-active')
  })

  // Force RenderService to refresh z-indices if possible or just update DOM
  const canvases = document.querySelectorAll('.drawing-canvas')
  canvases.forEach(c => {
    c.style.zIndex = mode ? '4' : '10'
  })
}

function enableTextEditMode(on) {
  state.textEditMode = !!on
  state.drawingMode = null // Disable drawing when editing text
  const layers = document.querySelectorAll('.annot-layer')
  layers.forEach(l => {
    if (state.textEditMode) l.classList.add('textedit-active')
    else l.classList.remove('textedit-active')
  })
}

function updateDrawingBarVisibility() {
  const bar = document.getElementById('drawingBar')
  if (!bar) return
  const show = !!state.drawingMode || !!state.shapeMode
  bar.classList.toggle('hidden', !show)
}

function enableShapeMode(on) {
  state.shapeMode = on ? (document.getElementById('shapeType')?.value || 'rect') : null
  state.textEditMode = false
  state.drawingMode = null
  state.annotMode = null
  setStatus(on ? `Modalità forma (${state.shapeMode}) attiva` : 'Modalità forma disattivata')
  updateDrawingBarVisibility()
}

function enableDrawingMode(mode) {
  state.drawingMode = mode
  state.textEditMode = false // Disable text edit when drawing
  state.annotMode = null
  state.shapeMode = null // disable shape tool when doing freehand
  const labels = { pen: 'Penna', eraser: 'Gomma Libera' }
  setStatus(mode ? `Modalità ${labels[mode]} attiva` : 'Modalità disegno disattivata')

  // Show/Hide drawing sub-bar or shape controls
  updateDrawingBarVisibility()
}

function dropTextBox(pageNumber, x, y) {
  const key = String(pageNumber)
  if (!state.textEdits[key]) state.textEdits[key] = {}

  const newId = 'new-' + Date.now()
  state.textEdits[key][newId] = {
    text: 'Scrivi qui...',
    rect: { x, y, w: 160, h: 32 },
    origRect: { x, y, w: 160, h: 32 },
    erase: false,
    ...state.currentFormatting
  }

  if (window.RenderService) {
    const annotLayer = document.querySelector(`.page-item[data-page="${pageNumber}"] .annot-layer`)
    if (annotLayer) {
      window.RenderService.addNewTextBox(pageNumber, newId, {
        x, y,
        text: 'Scrivi qui...',
        ...state.currentFormatting
      }, annotLayer)
    }
  }

  enableAnnotMode(null)
  // Auto-enable text edit mode so the new box is immediately movable/editable
  enableTextEditMode(true)
  setStatus('Testo aggiunto. Clicca per modificare, trascina per spostare.')
}

function addAnnotation(pageNumber, x, y) {
  const key = String(pageNumber)
  if (!state.annotations[key]) state.annotations[key] = []
  if (state.annotMode === 'text') {
    const text = document.getElementById('textInput').value || ''
    if (!text) return
    state.annotations[key].push({ type: 'text', x, y, color: state.annotColor, size: state.annotSize, text })
  } else if (state.annotMode === 'highlight') {
    state.annotations[key].push({ type: 'highlight', x, y, w: 120, h: 24, color: state.annotColor })
  }
}

function addAreaAnnotation(pageNumber, rect) {
  const key = String(pageNumber)
  if (!state.annotations[key]) state.annotations[key] = []
  if (state.annotMode === 'redact') {
    state.annotations[key].push({ type: 'redact', x: rect.x, y: rect.y, w: rect.w, h: rect.h })
  } else if (state.annotMode === 'replace') {
    const text = prompt('Nuovo testo per sostituire l’area selezionata:', document.getElementById('textInput').value || '')
    if (!text) return
    state.annotations[key].push({ type: 'replace', x: rect.x, y: rect.y, w: rect.w, h: rect.h, text, color: state.annotColor, size: state.annotSize })
  }
}

function recordTextEdit(pageNumber, idx, text, rect, origRect) {
  const key = String(pageNumber)
  if (!state.textEdits[key]) state.textEdits[key] = {}

  // Merge current formatting into the edit record
  const formatting = { ...state.currentFormatting }

  state.textEdits[key][String(idx)] = {
    text,
    rect,
    origRect,
    erase: false,
    ...formatting
  }
  state.history.push({ type: 'textEdit', pageNumber, idx, text, rect, origRect, ...formatting })
  state.redo = []
}

function showFormattingBar(show, values = null) {
  const bar = document.getElementById('formattingBar')
  if (!bar) return
  if (show) {
    bar.classList.remove('hidden')
    if (values) {
      state.currentFormatting = { ...values }
      document.getElementById('fontFamily').value = values.font || 'Helvetica'
      document.getElementById('fontSize').value = values.size || 14
      document.getElementById('fontColor').value = values.color || '#000000'
      document.getElementById('boldBtn').classList.toggle('active', !!values.bold)
      document.getElementById('italicBtn').classList.toggle('active', !!values.italic)
    }
  } else {
    bar.classList.add('hidden')
    state.selectedTextId = null
  }
}

function deleteTextEdit(pageNumber, idx, rect = null, origRect = null) {
  const key = String(pageNumber)
  if (!state.textEdits[key]) state.textEdits[key] = {}

  const edit = state.textEdits[key][String(idx)]
  if (edit) {
    edit.erase = true
    edit.text = ''
  } else if (rect && origRect) {
    state.textEdits[key][String(idx)] = {
      text: '',
      rect,
      origRect,
      erase: true,
      ...state.currentFormatting
    }
  }
  state.history.push({ type: 'erase', pageNumber, id: String(idx) })
  state.redo = []
  setStatus('Elemento rimosso.')
}

function placeImageOnPage(pageNumber, x, y) {
  if (!state.imageToPlace) return
  const key = String(pageNumber)
  if (!state.imageAdds[key]) state.imageAdds[key] = []
  const img = new Image()
  img.onload = () => {
    const w = Math.min(200, img.naturalWidth)
    const h = img.naturalHeight * (w / img.naturalWidth)
    const newImg = { dataUrl: state.imageToPlace, rect: { x: x - w / 2, y: y - h / 2, w, h } }
    state.imageAdds[key].push(newImg)
    state.history.push({ type: 'imageAdd', pageNumber, ...newImg })
    state.redo = []
    state.imageToPlace = null
    enableAnnotMode(null)
    setStatus('Immagine HD posizionata.')
    window.RenderService.renderAllPages(state.pdfDoc, state.pageOrder)
  }
  img.src = state.imageToPlace
}

function pushErase(pageNumber, rect) {
  const key = String(pageNumber)
  if (!state.textEdits[key]) state.textEdits[key] = {}
  const id = 'erase-' + Date.now()
  state.textEdits[key][id] = { text: '', rect, erase: true }
  state.history.push({ type: 'erase', pageNumber, id, rect })
  state.redo = []
}

function undo() {
  const last = state.history.pop()
  if (!last) return
  state.redo.push(last)
  if (last.type === 'textEdit') {
    const key = String(last.pageNumber)
    if (state.textEdits[key]) delete state.textEdits[key][String(last.idx)]
  } else if (last.type === 'imageAdd') {
    const key = String(last.pageNumber)
    if (state.imageAdds[key]) {
      state.imageAdds[key] = state.imageAdds[key].filter(it => it.rect !== last.rect || it.dataUrl !== last.dataUrl)
    }
  } else if (last.type === 'erase') {
    const key = String(last.pageNumber)
    if (state.textEdits[key]) delete state.textEdits[key][last.id]
  } else if (last.type === 'shapeAdd') {
    const key = String(last.pageNumber)
    if (state.shapes[key]) {
      // remove the exact shape object if still present
      state.shapes[key] = state.shapes[key].filter(s => s !== last.shape)
    }
  }
  setStatus('Undo executed')
}

function redo() {
  const op = state.redo.pop()
  if (!op) return
  state.history.push(op)
  if (op.type === 'textEdit') {
    recordTextEdit(op.pageNumber, op.idx, op.text, op.rect)
  } else if (op.type === 'imageAdd') {
    const key = String(op.pageNumber)
    if (!state.imageAdds[key]) state.imageAdds[key] = []
    state.imageAdds[key].push({ dataUrl: op.dataUrl, rect: op.rect })
  } else if (op.type === 'erase') {
    pushErase(op.pageNumber, op.rect)
  } else if (op.type === 'shapeAdd') {
    const key = String(op.pageNumber)
    if (!state.shapes[key]) state.shapes[key] = []
    state.shapes[key].push(op.shape)
  }
  setStatus('Redo executed')
}

function bindGlobalUI() {
  const safeListen = (id, event, fn) => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener(event, fn)
      console.log('  ✓ listener attached:', id, event)
    } else {
      console.warn('  ✗ element NOT FOUND:', id)
    }
  }

  console.log('>> binding file input...')
  safeListen('fileInput', 'change', e => handleFileInput(e.target.files))
  safeListen('imageFileInput', 'change', e => handleFileInput(e.target.files))

  // Add image to existing PDF page
  safeListen('imageAddInput', 'change', e => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setStatus('Loading image...')
    const reader = new FileReader()
    reader.onload = () => {
      state.imageToPlace = reader.result
      enableAnnotMode('addImage')
      setStatus('Clicca sulla pagina per posizionare l\'immagine')
    }
    reader.onerror = () => setStatus('Error reading image')
    reader.readAsDataURL(f)
    e.target.value = ''
  })

  safeListen('collabBtn', 'click', () => {
    alert('Collaborazione real‑time: funzione in sviluppo. Presto potrai invitare altri utenti!')
  })

  safeListen('saveCloudBtn', 'click', async () => {
    if (!state.pdfBytes || !isPdf(state.pdfBytes)) {
      setStatus('No valid PDF to save.');
      return
    }
    setStatus('Uploading...')
    try {
      const blob = new Blob([state.pdfBytes], { type: 'application/pdf' })
      const form = new FormData()
      form.append('file', blob, 'document.pdf')
      const resp = await fetch('/api/save', { method: 'POST', body: form })
      const json = await resp.json()
      setStatus(json.message || 'File uploaded!')
    } catch (e) {
      setStatus('Upload error: ' + e.message)
    }
  })

  safeListen('downloadBtn', 'click', () => {
    if (!state.pdfBytes || !isPdf(state.pdfBytes)) {
      setStatus('No valid PDF to download.')
      return
    }
    const blob = new Blob([state.pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pdf_modificato_' + Date.now() + '.pdf'; a.click()
    URL.revokeObjectURL(url)
  })

  safeListen('addTextBoxBtn', 'click', () => {
    enableAnnotMode('addText')
    setStatus('Click on the page to add text')
  })

  safeListen('extractBtn', 'click', async () => {
    if (!state.pdfBytes || state.selectedPages.size === 0) return
    setStatus('Extracting pages...')
    const bytes = await PdfService.extractPages(state.pdfBytes, Array.from(state.selectedPages).sort((a, b) => a - b))
    await loadPdfFromBytes(bytes)
  })

  safeListen('rotateBtn', 'click', async () => {
    if (!state.pdfBytes || state.selectedPages.size === 0) return
    setStatus('Rotating pages...')
    const bytes = await PdfService.rotatePages(state.pdfBytes, Array.from(state.selectedPages), 90)
    await loadPdfFromBytes(bytes)
  })

  safeListen('reorderBtn', 'click', async () => {
    if (!state.pdfBytes || state.pageOrder.length === 0) return
    setStatus('Reordering pages...')
    const bytes = await PdfService.reorderPages(state.pdfBytes, state.pageOrder)
    await loadPdfFromBytes(bytes)
  })

  safeListen('newPdfBtn', 'click', () => {
    const sel = document.getElementById('templateSelect')
    createNewPdf(sel ? sel.value : 'blank')
  })
  // Tool active state helper
  const setActiveTool = (id) => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'))
    if (id) {
      const el = document.getElementById(id)
      if (el) el.classList.add('active')
    }
  }

  safeListen('textEditToggle', 'click', () => {
    const next = !state.textEditMode
    enableTextEditMode(next)
    setActiveTool(next ? 'textEditToggle' : null)
  })

  safeListen('addTextBoxBtn', 'click', () => {
    enableAnnotMode('addText')
    setActiveTool('addTextBoxBtn')
    setStatus('Click on the page to add text')
  })

  safeListen('shapeBtn', 'click', () => {
    const next = !state.shapeMode
    enableShapeMode(next)
    setActiveTool(next ? 'shapeBtn' : null)
  })
  safeListen('shapeType', 'change', e => { if (state.shapeMode) state.shapeMode = e.target.value })

  safeListen('penBtn', 'click', () => { enableDrawingMode('pen'); setActiveTool('penBtn') })
  safeListen('eraserBtn', 'click', () => { enableDrawingMode('eraser'); setActiveTool('eraserBtn') })
  safeListen('closeDrawing', 'click', () => { enableDrawingMode(null); setActiveTool(null) })

  // Image editing tool button
  safeListen('imgEditBtn', 'click', () => {
    const bar = document.getElementById('imageEditBar')
    if (bar) bar.classList.toggle('hidden')
    setActiveTool('imgEditBtn')
  })
  safeListen('closeImageEdit', 'click', () => {
    const bar = document.getElementById('imageEditBar')
    if (bar) bar.classList.add('hidden')
    setActiveTool(null)
  })

  // Image filter/effects applied to selected image element
  const applyImageEffects = () => {
    const sel = document.querySelector('.image-item.selected')
    if (!sel) return
    const img = sel.querySelector('img')
    if (!img) return
    const brightness = document.getElementById('imgBrightness')?.value || 0
    const contrast = document.getElementById('imgContrast')?.value || 0
    const saturation = document.getElementById('imgSaturation')?.value || 0
    const filter = document.getElementById('imgFilter')?.value || 'none'
    let cssFilter = `brightness(${1 + brightness/100}) contrast(${1 + contrast/100}) saturate(${1 + saturation/100})`
    if (filter === 'grayscale') cssFilter += ' grayscale(1)'
    else if (filter === 'sepia') cssFilter += ' sepia(0.8)'
    else if (filter === 'blur') cssFilter += ' blur(2px)'
    else if (filter === 'vintage') cssFilter += ' sepia(0.4) saturate(0.8) contrast(1.1)'
    img.style.filter = cssFilter
  }
  ;['imgBrightness', 'imgContrast', 'imgSaturation', 'imgFilter'].forEach(id => {
    safeListen(id, 'input', applyImageEffects)
    safeListen(id, 'change', applyImageEffects)
  })

  safeListen('imgFlipH', 'click', () => {
    const sel = document.querySelector('.image-item.selected')
    if (!sel) return
    const img = sel.querySelector('img')
    if (!img) return
    const cur = img.style.transform || ''
    img.style.transform = cur.includes('scaleX(-1)') ? cur.replace('scaleX(-1)', '') : cur + ' scaleX(-1)'
  })
  safeListen('imgFlipV', 'click', () => {
    const sel = document.querySelector('.image-item.selected')
    if (!sel) return
    const img = sel.querySelector('img')
    if (!img) return
    const cur = img.style.transform || ''
    img.style.transform = cur.includes('scaleY(-1)') ? cur.replace('scaleY(-1)', '') : cur + ' scaleY(-1)'
  })
  safeListen('imgRotate', 'click', () => {
    const sel = document.querySelector('.image-item.selected')
    if (!sel) return
    const cur = parseInt(sel.dataset.rotation || '0')
    const next = (cur + 90) % 360
    sel.dataset.rotation = String(next)
    sel.style.transform = `rotate(${next}deg)`
  })

  // Text alignment buttons
  safeListen('underlineBtn', 'click', () => {
    const id = state.selectedTextId
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    const content = el.querySelector('.text-content') || el
    const isUnderline = content.style.textDecoration === 'underline'
    content.style.textDecoration = isUnderline ? 'none' : 'underline'
    document.getElementById('underlineBtn')?.classList.toggle('active', !isUnderline)
  })
  safeListen('alignLeftBtn', 'click', () => {
    const id = state.selectedTextId
    if (!id) return
    const el = document.getElementById(id)
    if (el) { el.style.textAlign = 'left'; document.getElementById('alignLeftBtn')?.classList.add('active'); document.getElementById('alignCenterBtn')?.classList.remove('active'); document.getElementById('alignRightBtn')?.classList.remove('active') }
  })
  safeListen('alignCenterBtn', 'click', () => {
    const id = state.selectedTextId
    if (!id) return
    const el = document.getElementById(id)
    if (el) { el.style.textAlign = 'center'; document.getElementById('alignCenterBtn')?.classList.add('active'); document.getElementById('alignLeftBtn')?.classList.remove('active'); document.getElementById('alignRightBtn')?.classList.remove('active') }
  })
  safeListen('alignRightBtn', 'click', () => {
    const id = state.selectedTextId
    if (!id) return
    const el = document.getElementById(id)
    if (el) { el.style.textAlign = 'right'; document.getElementById('alignRightBtn')?.classList.add('active'); document.getElementById('alignLeftBtn')?.classList.remove('active'); document.getElementById('alignCenterBtn')?.classList.remove('active') }
  })

  safeListen('exportPngBtn', 'click', () => {
    const canvas = App.state.pageCanvases[0]
    if (!canvas) return
    canvas.toBlob(b => {
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url; a.download = 'canvas_' + Date.now() + '.png'; a.click()
      URL.revokeObjectURL(url)
    })
  })

  safeListen('toggleGridBtn', 'click', () => {
    let grid = document.querySelector('.grid-overlay')
    if (grid) {
      grid.remove()
    } else {
      const viewer = document.getElementById('viewer')
      if (viewer) {
        grid = document.createElement('div')
        grid.className = 'grid-overlay'
        viewer.appendChild(grid)
      }
    }
  })

  safeListen('toggleLayersBtn', 'click', () => {
    const panel = document.getElementById('rightPanel')
    if (panel) panel.classList.toggle('hidden')
    refreshLayers()
  })

  safeListen('strokeColor', 'input', e => {
    const val = e.target.value
    state.drawingStroke.color = val
    state.shapeColor = val
  })
  safeListen('strokeWidth', 'input', e => {
    const w = parseInt(e.target.value)
    state.drawingStroke.width = w
    state.shapeStrokeWidth = w
  })

  safeListen('clearAllTextBtn', 'click', () => {
    if (!state.pdfDoc || !confirm('Sicuro di voler nascondere TUTTO il testo originale?')) return
    setStatus('Pulizia testo totale...')
    const layers = document.querySelectorAll('.annot-layer')
    layers.forEach(layer => {
      const pageNum = parseInt(layer.closest('.page-item').dataset.page)
      const spans = layer.querySelectorAll('.text-item')
      spans.forEach(span => {
        // Trigger the mask via handleDelete logic or direct record
        const id = span.id.split('-').pop()
        if (id) {
          const rect = span.getBoundingClientRect(), pr = layer.getBoundingClientRect()
          const ox = parseFloat(span.dataset.ox), oy = parseFloat(span.dataset.oy)
          const ow = parseFloat(span.dataset.ow), oh = parseFloat(span.dataset.oh)

          deleteTextEdit(pageNum, id,
            { x: rect.left - pr.left, y: rect.top - pr.top, w: rect.width, h: rect.height },
            { x: ox, y: oy, w: ow, h: oh })

          const mask = document.createElement('div')
          mask.className = 'visual-mask'
          mask.style.left = ox + 'px'; mask.style.top = oy + 'px'
          mask.style.width = ow + 'px'; mask.style.height = oh + 'px'
          layer.appendChild(mask)
          span.remove()
        }
      })
    })
    setStatus('Testo originale nascosto. Clicca "Applica" per salvare.')
  })

  safeListen('undoBtn', 'click', () => undo())
  safeListen('redoBtn', 'click', () => redo())

  const updateZoomLabel = () => {
    const lbl = document.getElementById('zoomLabel')
    if (lbl) lbl.textContent = Math.round(state.zoom * 100) + '%'
  }

  safeListen('zoomInBtn', 'click', async () => {
    state.zoom = Math.min(2.0, parseFloat((state.zoom + 0.1).toFixed(1)))
    updateZoomLabel()
    if (state.pdfDoc) await window.RenderService.renderAllPages(state.pdfDoc, state.pageOrder)
  })

  safeListen('zoomOutBtn', 'click', async () => {
    state.zoom = Math.max(0.3, parseFloat((state.zoom - 0.1).toFixed(1)))
    updateZoomLabel()
    if (state.pdfDoc) await window.RenderService.renderAllPages(state.pdfDoc, state.pageOrder)
  })

  safeListen('zoomFitBtn', 'click', async () => {
    const viewer = document.getElementById('viewer')
    if (!viewer || !state.pdfDoc) return
    const vw = viewer.clientWidth - 120
    const firstPage = await state.pdfDoc.getPage(1)
    const vp = firstPage.getViewport({ scale: 1 })
    state.zoom = Math.max(0.3, Math.min(2.0, parseFloat((vw / vp.width).toFixed(2))))
    updateZoomLabel()
    await window.RenderService.renderAllPages(state.pdfDoc, state.pageOrder)
  })

  safeListen('applyTextBtn', 'click', async () => {
    if (!state.pdfBytes || state.isProcessing) return
    setStatus('Sincronizzazione modifiche…')

    // Force blur currently focused element to ensure last edit is saved
    if (document.activeElement && document.activeElement.classList.contains('editing')) {
      document.activeElement.blur()
    }

    try {
      state.isProcessing = true
      setStatus('Generazione PDF in corso…')

      if (!state.pdfBytes || state.pdfBytes.byteLength === 0) {
        throw new Error('Lo stato del PDF è corrotto (buffer dissociato). Ricarica il file.')
      }

      const currentBuffer = cloneBuffer(state.pdfBytes)
      let bytes = await PdfService.applyTextEdits(currentBuffer, state.textEdits, state.pageScale)

      if (Object.keys(state.imageAdds).length) {
        setStatus('Applicazione immagini…')
        bytes = await PdfService.applyImages(bytes, state.imageAdds, state.pageScale)
      }

      if (Object.keys(state.drawings).length) {
        setStatus('Applicazione disegni...')
        bytes = await PdfService.applyFreehandDrawings(bytes, state.drawings, state.pageScale)
      }

      if (Object.keys(state.shapes).length) {
        setStatus('Applicazione forme...')
        bytes = await PdfService.applyShapes(bytes, state.shapes, state.pageScale)
      }

      if (!isPdf(bytes)) {
        throw new Error('Errore critico: Il PDF generato è corrotto (header mancante).')
      }

      state.textEdits = {}
      state.imageAdds = {}
      state.drawings = {}
      state.shapes = {}
      state.imageToPlace = null
      state.history = []
      state.redo = []
      enableTextEditMode(false)
      enableDrawingMode(null)
      enableAnnotMode(null)

      state.isProcessing = false // Reset before load to allow loadPdfFromBytes
      await loadPdfFromBytes(bytes)
      setStatus('Modifiche salvate!')
    } catch (err) {
      console.error('[Apply Error]', err)
      setStatus('Errore fatale: ' + err.message)
      state.isProcessing = false
    }
  })

  // Template cards on welcome screen
  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      const tpl = card.dataset.template
      const sel = document.getElementById('templateSelect')
      if (sel) sel.value = tpl
      createNewPdf(tpl)
    })
  })

  // Welcome screen "Nuovo documento" button
  safeListen('newPdfWelcomeBtn', 'click', () => {
    const sel = document.getElementById('templateSelect')
    createNewPdf(sel ? sel.value : 'blank')
  })

  // Right panel tabs
  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'))
      document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'))
      tab.classList.add('active')
      const target = tab.dataset.panel
      const content = document.getElementById(target + 'Panel')
      if (content) content.classList.add('active')
    })
  })

  const imgIn = document.getElementById('imgIn')
  if (imgIn) imgIn.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setStatus('Ottimizzazione immagine HD...')

    // Read high-quality data URL
    const reader = new FileReader()
    reader.onload = () => {
      state.imageToPlace = reader.result
      enableAnnotMode('addImage')
      setStatus('Clicca sulla pagina per posizionare l’immagine HD')
    }
    reader.onerror = () => setStatus('Error reading image')
    reader.readAsDataURL(f)
  })
}

// initialization helper: some build tools fire scripts after DOMContentLoaded
function initializeApp() {
  console.log('>>> INIT app.js at readyState=', document.readyState)
  try {
    bindGlobalUI();
    console.log('\u2713 bindGlobalUI done')
    bindDragAndDrop();
    console.log('\u2713 bindDragAndDrop done')
    
    // Mobile touch support
    setupTouchSupport()
    console.log('\u2713 touch support setup')
    
    // prepare resource items for dragging
    document.querySelectorAll('.resource-item').forEach(img => {
      img.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', img.src)
      })
      img.addEventListener('click', () => {
        // place image at center of first page
        state.imageToPlace = img.src
        enableAnnotMode('addImage')
        setStatus('Clicca sulla pagina per posizionare l’immagine risorsa')
      })
    })
    console.log('\u2713 resources bound')
    console.log('>>> APP READY')
    document.getElementById('status').textContent = 'Editor ready - scegli un PDF o trascina qui'
  } catch (e) {
    console.error('>>> INIT ERROR:', e)
    document.getElementById('status').textContent = 'ERRORE: ' + e.message
  }
}

// Mobile touch support setup
function setupTouchSupport() {
  // Prevent default touch behaviors that interfere with the app
  document.addEventListener('touchmove', e => {
    const target = e.target;
    if (target.closest('.ctx-bar') || target.closest('.sidebar-left')) {
      return;
    }
    if (target.closest('.canvas-area') || target.closest('.pages')) {
      e.preventDefault();
    }
  }, { passive: false });

  // Handle touch events for better mobile experience
  document.addEventListener('touchstart', e => {
    const target = e.target.closest('.topbar-btn, .tool-btn, .ctx-toggle-btn, .zoom-btn');
    if (target) {
      target.classList.add('touch-active');
    }
  }, { passive: true });

  document.addEventListener('touchend', e => {
    document.querySelectorAll('.touch-active').forEach(el => {
      el.classList.remove('touch-active');
    });
  }, { passive: true });

  // Handle double-tap to zoom on canvas
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      const target = e.target.closest('.page-item canvas');
      if (target) {
        e.preventDefault();
        const zoomBtn = document.getElementById('zoomFitBtn');
        if (zoomBtn) zoomBtn.click();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Handle pinch-to-zoom on canvas area
  let initialPinchDistance = 0;
  let initialZoom = 0;

  document.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      initialZoom = state.zoom || 1;
    }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (initialPinchDistance > 0) {
        const scale = distance / initialPinchDistance;
        const newZoom = Math.max(0.25, Math.min(4, initialZoom * scale));
        state.zoom = newZoom;
        
        const zoomLabel = document.getElementById('zoomLabel');
        if (zoomLabel) {
          zoomLabel.textContent = Math.round(newZoom * 100) + '%';
        }
        
        if (App.state.currentPdf) {
          RenderService.renderAllPages(App.state.currentPdf, App.state.pageOrder || []);
        }
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    initialPinchDistance = 0;
  }, { passive: true });

  // Handle long press for context menu on mobile
  let longPressTimer = null;
  let longPressTarget = null;

  document.addEventListener('touchstart', e => {
    longPressTarget = e.target.closest('.layer-item, .page-item');
    if (longPressTarget) {
      longPressTimer = setTimeout(() => {
        if (longPressTarget) {
          longPressTarget.classList.add('long-press-active');
        }
      }, 500);
    }
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressTarget) {
      longPressTarget.classList.remove('long-press-active');
      longPressTarget = null;
    }
  }, { passive: true });

  document.addEventListener('touchmove', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });
}

if (document.readyState === 'loading') {
  console.log('>>> waiting for DOMContentLoaded')
  document.addEventListener('DOMContentLoaded', initializeApp)
} else {
  console.log('>>> DOM already ready, init now')
  initializeApp()
}
function refreshLayers() {
  const list = document.getElementById('layersList')
  if (!list) return
  list.innerHTML = ''
  const pageGroups = {}
  Object.entries(state.textEdits || {}).forEach(([pg, edits]) => {
    pageGroups[`Pagina ${pg} - testo`] = Object.keys(edits).length
  })
  Object.entries(state.imageAdds || {}).forEach(([pg, imgs]) => {
    pageGroups[`Pagina ${pg} - immagini`] = imgs.length
  })
  Object.entries(state.drawings || {}).forEach(([pg, d]) => {
    pageGroups[`Pagina ${pg} - disegni`] = d.length
  })
  Object.entries(state.shapes || {}).forEach(([pg, s]) => {
    pageGroups[`Pagina ${pg} - forme`] = s.length
  })
  Object.entries(pageGroups).forEach(([label, count]) => {
    const li = document.createElement('li')
    li.textContent = `${label}: ${count}`
    list.appendChild(li)
  })
}

const App = {
  loadPdfFromBytes,
  toggleSelection,
  addAnnotation,
  recordTextEdit,
  deleteTextEdit,
  showFormattingBar,
  placeImageOnPage,
  addAreaAnnotation,
  pushErase,
  dropTextBox,
  state
}

window.App = App

async function imageFileToPdf(bytes) {
  // create a PDF with a single page containing the image scaled intelligently
  const doc = await PDFLib.PDFDocument.create()
  let img
  if (/png/.test(bytes.type)) {
    img = await doc.embedPng(bytes.data)
  } else if (/gif/.test(bytes.type)) {
    img = await doc.embedPng(bytes.data) // treat GIF as PNG
  } else {
    img = await doc.embedJpg(bytes.data)
  }
  
  // Get image dimensions
  const imgWidth = img.width
  const imgHeight = img.height
  const imgAspect = imgWidth / imgHeight
  
  // Standard A4 page size
  const pageWidth = 595.28
  const pageHeight = 841.89
  const pageAspect = pageWidth / pageHeight
  const margin = 20
  
  // Calculate scaling to fit image on page while preserving aspect ratio
  let finalWidth, finalHeight
  if (imgAspect > pageAspect) {
    // Image wider than page: scale by width
    finalWidth = pageWidth - (margin * 2)
    finalHeight = finalWidth / imgAspect
  } else {
    // Image taller than page: scale by height
    finalHeight = pageHeight - (margin * 2)
    finalWidth = finalHeight * imgAspect
  }
  
  // Center image on page
  const x = (pageWidth - finalWidth) / 2
  const y = (pageHeight - finalHeight) / 2
  
  const page = doc.addPage([pageWidth, pageHeight])
  page.drawImage(img, {
    x: x,
    y: y,
    width: finalWidth,
    height: finalHeight
  })
  
  const b = await doc.save()
  return new Uint8Array(b)
}

function bindDragAndDrop() {
  const viewer = document.getElementById('viewer')
  console.log('[Debug] bindDragAndDrop viewer=', viewer)
  if (!viewer) return
  const setActive = on => viewer.classList.toggle('drop-active', !!on)
  const prevent = e => { e.preventDefault(); e.stopPropagation(); console.log('[Debug] prevent', e.type) }

  const attach = (el) => {
    ;['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => { prevent(e); setActive(true) }))
    ;['dragleave', 'dragend'].forEach(ev => el.addEventListener(ev, e => { prevent(e); setActive(false) }))
    el.addEventListener('drop', async e => {
    console.log('>> DROP event on', e.target.className)
    prevent(e); setActive(false)
    setStatus('Elaborazione file...')
    // handle resource drag (data uri) first
    const txt = e.dataTransfer.getData('text/plain')

      const files = Array.from(e.dataTransfer.files || [])
      console.log('>> dropped', files.length, 'files')
      if (!files.length) {
        console.log('>> no files in drop')
        return
      }

      // separate pdfs and images
      const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
      const imgs = files.filter(f => f.type.startsWith('image/'))

      if (imgs.length && !pdfs.length && !state.pdfBytes) {
        const data = await imgs[0].arrayBuffer()
        const bytes = await imageFileToPdf({ type: imgs[0].type, data: new Uint8Array(data) })
        await loadPdfFromBytes(bytes)
        return
      }

      if (pdfs.length > 0) {
        if (pdfs.length === 1 && !state.pdfBytes) {
          const bytes = new Uint8Array(await pdfs[0].arrayBuffer())
          await loadPdfFromBytes(bytes)
        } else {
          const list = []
          for (const f of pdfs) {
            list.push(new Uint8Array(await f.arrayBuffer()))
          }
          if (imgs.length) {
            for (const imgFile of imgs) {
              const data = await imgFile.arrayBuffer()
              const pdfImg = await imageFileToPdf({ type: imgFile.type, data: new Uint8Array(data) })
              list.push(pdfImg)
            }
          }
          const merged = await PdfService.mergePdfs(([state.pdfBytes].filter(Boolean)).concat(list))
          await loadPdfFromBytes(merged)
        }
      }
    })
  }

  // attach to viewer and document for robust capture
  attach(viewer)
  attach(document)
}
