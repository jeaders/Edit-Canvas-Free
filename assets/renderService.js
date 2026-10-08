console.log('>>> renderService.js module EXECUTING')
const RenderService = {
  async renderAllPages(pdf, order) {
    console.log('[RenderService] renderAllPages called order=', order, 'zoom=', App.state.zoom)
    const container = document.getElementById('pages')
    if (!container) {
      console.error('[RenderService] pages container not found')
      throw new Error('pages container missing')
    }
    container.innerHTML = ''
    App.state.pageCanvases = []
    App.state.pageScale = []
    for (let i = 0; i < order.length; i++) {
      const pageNumber = order[i]
      console.log('[RenderService] rendering page', pageNumber)
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: App.state.zoom || 0.8 })
      App.state.pageScale[pageNumber - 1] = App.state.zoom || 0.8
      const item = document.createElement('div')
      item.className = 'page-item'
      item.dataset.page = String(pageNumber)

      const toolbar = document.createElement('div')
      toolbar.className = 'page-toolbar'
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'checkbox'
      checkbox.addEventListener('change', e => App.toggleSelection(pageNumber, e.target.checked))

      const handle = document.createElement('div')
      handle.className = 'drag-handle'
      handle.textContent = '⇅'
      handle.draggable = true
      handle.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', String(pageNumber))
      })

      item.addEventListener('dragover', e => e.preventDefault())
      item.addEventListener('drop', e => {
        e.preventDefault()
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
        const to = pageNumber
        RenderService.reorder(from, to)
      })

      toolbar.appendChild(checkbox)
      toolbar.appendChild(handle)

      const canvas = document.createElement('canvas')
      canvas.className = 'page-canvas'
      const context = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const renderTask = page.render({ canvasContext: context, viewport })
      await renderTask.promise

      const annotLayer = document.createElement('div')
      annotLayer.className = 'annot-layer'
      await RenderService.renderTextItems(page, viewport, annotLayer, pageNumber)

      // Render newly added text boxes or template items
      const edits = App.state.textEdits[pageNumber] || {}
      Object.entries(edits).forEach(([id, values]) => {
        if (isNaN(id)) { // New items (non-numeric IDs)
          RenderService.addNewTextBox(pageNumber, id, values, annotLayer)
        }
      })

      // Render added images with interaction layer
      const images = App.state.imageAdds[pageNumber] || []
      images.forEach((img, idx) => {
        RenderService.renderImageItem(pageNumber, idx, img, annotLayer)
      })

      // Interaction Layer (Mobile Friendly)
      annotLayer.addEventListener('pointerdown', e => {
        if (App.state.annotMode === 'addImage') {
          const rect = annotLayer.getBoundingClientRect()
          App.placeImageOnPage(pageNumber, e.clientX - rect.left, e.clientY - rect.top)
        } else if (App.state.annotMode === 'addText') {
          const rect = annotLayer.getBoundingClientRect()
          App.dropTextBox(pageNumber, e.clientX - rect.left, e.clientY - rect.top)
        }
      })

      const drawCanvas = document.createElement('canvas')
      drawCanvas.className = 'drawing-canvas'
      drawCanvas.width = viewport.width
      drawCanvas.height = viewport.height
      drawCanvas.style.position = 'absolute'
      drawCanvas.style.top = '0'
      drawCanvas.style.left = '0'
      drawCanvas.style.pointerEvents = 'none'
      drawCanvas.style.zIndex = App.state.annotMode ? '4' : '10'
      RenderService.initDrawingCanvas(drawCanvas, pageNumber)

      item.appendChild(toolbar)
      item.appendChild(canvas)
      item.appendChild(annotLayer)
      item.appendChild(drawCanvas)
      container.appendChild(item)
      App.state.pageCanvases.push(canvas)
    }
    // update layers panel whenever pages re‑render
    if (window.refreshLayers) window.refreshLayers()
  },

  initDrawingCanvas(canvas, pageNumber) {
    const ctx = canvas.getContext('2d')
    let currentPath = null
    let shapeStart = null

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect()
      return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) }
    }

    const drawPreviewShape = (from, to) => {
      if (!from || !to) return
      ctx.save()
      ctx.strokeStyle = App.state.shapeColor
      ctx.lineWidth = App.state.shapeStrokeWidth
      ctx.beginPath()
      const w = to.x - from.x
      const h = to.y - from.y
      if (App.state.shapeMode === 'rect') {
        ctx.rect(from.x, from.y, w, h)
      } else if (App.state.shapeMode === 'circle') {
        const cx = from.x + w / 2
        const cy = from.y + h / 2
        const r = Math.hypot(w, h) / 2
        ctx.arc(cx, cy, r, 0, 2 * Math.PI)
      } else if (App.state.shapeMode === 'line') {
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(from.x + w, from.y + h)
      }
      ctx.stroke()
      ctx.restore()
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (App.state.shapeMode) {
        canvas.setPointerCapture(e.pointerId)
        App.state.isDrawing = true
        shapeStart = getPos(e)
        return
      }
      if (!App.state.drawingMode) return
      canvas.setPointerCapture(e.pointerId)
      App.state.isDrawing = true
      const pos = getPos(e)
      currentPath = {
        points: [pos],
        color: App.state.drawingMode === 'eraser' ? '#ffffff' : App.state.drawingStroke.color,
        width: App.state.drawingMode === 'eraser' ? App.state.eraserSize : App.state.drawingStroke.width,
        mode: App.state.drawingMode
      }
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.strokeStyle = currentPath.color
      ctx.lineWidth = currentPath.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!App.state.isDrawing) return
      const pos = getPos(e)
      if (App.state.shapeMode && shapeStart) {
        // redraw base content then preview
        RenderService.redrawFreehand(canvas, pageNumber)
        RenderService.renderShapes(canvas, pageNumber)
        drawPreviewShape(shapeStart, pos)
        return
      }
      if (!currentPath) return
      currentPath.points.push(pos)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    })

    canvas.addEventListener('pointerup', (e) => {
      if (!App.state.isDrawing) return
      App.state.isDrawing = false
      canvas.releasePointerCapture(e.pointerId)
      if (App.state.shapeMode && shapeStart) {
        const pos = getPos(e)
        const key = String(pageNumber)
        if (!App.state.shapes[key]) App.state.shapes[key] = []
        const newShape = {
          type: App.state.shapeMode,
          x: Math.min(shapeStart.x, pos.x),
          y: Math.min(shapeStart.y, pos.y),
          w: Math.abs(pos.x - shapeStart.x),
          h: Math.abs(pos.y - shapeStart.y),
          color: App.state.shapeColor,
          width: App.state.shapeStrokeWidth
        }
        App.state.shapes[key].push(newShape)
        App.state.history.push({ type: 'shapeAdd', pageNumber, shape: newShape })
        App.state.redo = []
        shapeStart = null
        RenderService.renderShapes(canvas, pageNumber)
        return
      }
      if (currentPath && currentPath.points.length > 1) {
        if (!App.state.drawings[pageNumber]) App.state.drawings[pageNumber] = []
        App.state.drawings[pageNumber].push(currentPath)
      }
      currentPath = null
    })

    // Listen for mode changes to toggle pointer-events
    const observer = new MutationObserver(() => {
      const isDrawing = !!App.state.drawingMode || !!App.state.shapeMode
      canvas.style.pointerEvents = isDrawing ? 'auto' : 'none'
      canvas.style.cursor = isDrawing ? 'crosshair' : 'default'
    })
    // Dummy element to trigger observer or polling
    setInterval(() => {
      const isDrawing = !!App.state.drawingMode || !!App.state.shapeMode
      if ((canvas.style.pointerEvents === 'auto') !== isDrawing) {
        canvas.style.pointerEvents = isDrawing ? 'auto' : 'none'
        canvas.style.cursor = isDrawing ? 'crosshair' : 'default'
      }
    }, 200)

    // Initial render of existing drawings for this page
    RenderService.redrawFreehand(canvas, pageNumber)
  },

  redrawFreehand(canvas, pageNumber) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const draws = App.state.drawings[pageNumber] || []
    draws.forEach(path => {
      ctx.beginPath()
      ctx.moveTo(path.points[0].x, path.points[0].y)
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y)
      }
      ctx.strokeStyle = path.color
      ctx.lineWidth = path.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    })

    // render any static shapes on this page as well
    RenderService.renderShapes(canvas, pageNumber)
  },

  // helper to draw a single shape object onto a context
  drawShape(ctx, shape) {
    ctx.save()
    ctx.strokeStyle = shape.color || '#6e44ff'
    ctx.fillStyle = shape.fill || 'transparent'
    ctx.lineWidth = shape.width || 2
    ctx.beginPath()
    if (shape.type === 'rect') {
      ctx.rect(shape.x, shape.y, shape.w, shape.h)
      ctx.stroke()
      if (shape.fill && shape.fill !== 'transparent') ctx.fill()
    } else if (shape.type === 'circle') {
      const cx = shape.x + shape.w / 2
      const cy = shape.y + shape.h / 2
      const r = Math.min(Math.abs(shape.w), Math.abs(shape.h)) / 2
      ctx.arc(cx, cy, r, 0, 2 * Math.PI)
      ctx.stroke()
      if (shape.fill && shape.fill !== 'transparent') ctx.fill()
    } else if (shape.type === 'line') {
      ctx.moveTo(shape.x, shape.y)
      ctx.lineTo(shape.x + shape.w, shape.y + shape.h)
      ctx.stroke()
    } else if (shape.type === 'arrow') {
      const ex = shape.x + shape.w, ey = shape.y + shape.h
      const angle = Math.atan2(ey - shape.y, ex - shape.x)
      const headLen = Math.max(12, ctx.lineWidth * 4)
      ctx.moveTo(shape.x, shape.y)
      ctx.lineTo(ex, ey)
      ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6))
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6))
      ctx.stroke()
    } else if (shape.type === 'triangle') {
      const cx = shape.x + shape.w / 2
      ctx.moveTo(cx, shape.y)
      ctx.lineTo(shape.x + shape.w, shape.y + shape.h)
      ctx.lineTo(shape.x, shape.y + shape.h)
      ctx.closePath()
      ctx.stroke()
      if (shape.fill && shape.fill !== 'transparent') ctx.fill()
    } else if (shape.type === 'star') {
      const cx = shape.x + shape.w / 2, cy = shape.y + shape.h / 2
      const outerR = Math.min(Math.abs(shape.w), Math.abs(shape.h)) / 2
      const innerR = outerR * 0.4
      const spikes = 5
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR
        const a = (i * Math.PI) / spikes - Math.PI / 2
        if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
        else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
      }
      ctx.closePath()
      ctx.stroke()
      if (shape.fill && shape.fill !== 'transparent') ctx.fill()
    }
    ctx.restore()
  },

  renderShapes(canvas, pageNumber) {
    const ctx = canvas.getContext('2d')
    const shapes = App.state.shapes[pageNumber] || []
    shapes.forEach(s => RenderService.drawShape(ctx, s))
  },

  createActionBar(span, onDelete) {
    const bar = document.createElement('div')
    bar.className = 'text-actions-bar'
    const moveBtn = document.createElement('div')
    moveBtn.className = 'action-btn-sm move-handle'
    moveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>'
    const delBtn = document.createElement('button')
    delBtn.className = 'action-btn-sm delete'
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>'
    delBtn.onclick = (e) => { e.stopPropagation(); onDelete() }

    // Add Resize Label/Input if needed, or just handle via drag handle.
    // User asked for "possibilità di modificare la grandezza della casella"

    bar.appendChild(moveBtn); bar.appendChild(delBtn)
    return bar
  },

  setupResize(span, id, pageNumber, isImage, onComplete) {
    const handle = document.createElement('div')
    handle.className = 'resize-handle'
    span.appendChild(handle)

    let isResizing = false, startX, startY, startW, startH
    handle.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault()
      isResizing = true; startX = e.clientX; startY = e.clientY
      startW = span.offsetWidth; startH = span.offsetHeight

      const onMove = ev => {
        if (!isResizing) return
        const newW = Math.max(20, startW + (ev.clientX - startX))
        const newH = Math.max(20, startH + (ev.clientY - startY))
        span.style.width = newW + 'px'
        span.style.height = newH + 'px'

        if (isImage) {
          // If it's an image, we might want to update the state too
          const imgData = App.state.imageAdds[pageNumber][id]
          if (imgData) {
            imgData.rect.w = newW
            imgData.rect.h = newH
          }
        }
      }

      const onUp = () => {
        isResizing = false
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        if (onComplete) onComplete()
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })
  },

  setupItem(span, id, pageNumber, initialValues, layer) {
    span.id = 'txt-' + pageNumber + '-' + id
    const content = span.querySelector('.text-content') || span

    const updateVisualMask = () => {
      let mask = layer.querySelector(`.visual-mask[data-for="${span.id}"]`)
      if (!mask) {
        mask = document.createElement('div')
        mask.className = 'visual-mask'
        mask.dataset.for = span.id
        layer.insertBefore(mask, span)
      }
      mask.style.left = span.dataset.ox + 'px'
      mask.style.top = span.dataset.oy + 'px'
      mask.style.width = span.dataset.ow + 'px'
      mask.style.height = span.dataset.oh + 'px'
    }

    const syncEdit = () => {
      const rect = span.getBoundingClientRect()
      const parentRect = layer.getBoundingClientRect()
      const x = rect.left - parentRect.left, y = rect.top - parentRect.top
      if (!span.dataset.ow) {
        span.dataset.ow = String(rect.width); span.dataset.oh = String(rect.height)
        span.dataset.ox = String(initialValues.x); span.dataset.oy = String(initialValues.y)
      }
      updateVisualMask()
      App.recordTextEdit(pageNumber, id, content.innerText.trim(), { x, y, w: rect.width, h: rect.height },
        { x: parseFloat(span.dataset.ox), y: parseFloat(span.dataset.oy), w: parseFloat(span.dataset.ow), h: parseFloat(span.dataset.oh) })
    }

    setTimeout(() => {
      const rect = span.getBoundingClientRect()
      span.dataset.ow = String(rect.width); span.dataset.oh = String(rect.height)
      span.dataset.ox = String(initialValues.x); span.dataset.oy = String(initialValues.y)
    }, 0)

    content.addEventListener('click', e => {
      if (!App.state.textEditMode) return
      e.stopPropagation()
      content.contentEditable = 'true'; span.classList.add('editing'); content.focus()
      App.state.selectedTextId = span.id
      App.showFormattingBar(true, {
        font: span.style.fontFamily.replace(/['"]/g, '') || 'Helvetica',
        size: parseInt(span.style.fontSize) || 14,
        color: span.style.color || '#000000',
        bold: span.style.fontWeight === 'bold',
        italic: span.style.fontStyle === 'italic'
      })
    })

    content.addEventListener('blur', () => {
      span.classList.remove('editing'); content.contentEditable = 'false'; syncEdit()
    })

    let isDragging = false, startX, startY, origLX, origLY
    span.addEventListener('mousedown', e => {
      // Allow drag from move-handle OR from the span itself when in textEditMode
      const fromHandle = e.target.closest('.move-handle')
      const fromSpan = e.target === span || e.target.closest('.text-item') === span
      if (!App.state.textEditMode) return
      if (!fromHandle && !fromSpan) return
      if (e.target.closest('.text-content') && !fromHandle) return // let text editing work
      if (e.target.closest('.text-actions-bar') && !fromHandle) return
      e.stopPropagation()
      isDragging = true; startX = e.clientX; startY = e.clientY
      origLX = parseFloat(span.style.left) || 0; origLY = parseFloat(span.style.top) || 0
      span.style.cursor = 'grabbing'
      const onMove = ev => {
        if (!isDragging) return
        span.style.left = (origLX + (ev.clientX - startX)) + 'px'
        span.style.top = (origLY + (ev.clientY - startY)) + 'px'
      }
      const onUp = () => {
        isDragging = false; span.style.cursor = 'move'
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
        syncEdit()
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })

    this.setupResize(span, id, pageNumber, false, () => syncEdit())
  },

  handleDelete(pageNumber, id, span, layer) {
    const ox = parseFloat(span.dataset.ox), oy = parseFloat(span.dataset.oy)
    const ow = parseFloat(span.dataset.ow), oh = parseFloat(span.dataset.oh)
    const rect = span.getBoundingClientRect(), pr = layer.getBoundingClientRect()
    App.deleteTextEdit(pageNumber, id,
      { x: rect.left - pr.left, y: rect.top - pr.top, w: rect.width, h: rect.height },
      { x: ox, y: oy, w: ow, h: oh })

    const mask = document.createElement('div')
    mask.className = 'visual-mask'
    mask.style.left = ox + 'px'; mask.style.top = oy + 'px'
    mask.style.width = ow + 'px'; mask.style.height = oh + 'px'
    layer.appendChild(mask)
    span.remove()
    App.showFormattingBar(false)
  },

  async renderTextItems(page, viewport, layer, pageNumber) {
    const tc = await page.getTextContent()
    const scale = App.state.zoom || 0.8
    const items = tc.items.map((it, idx) => ({
      idx,
      str: it.str,
      x: it.transform[4] * scale,
      y: it.transform[5] * scale
    }))

    // More aggressive merging for "Canva-style" editing
    const mergedItems = []
    let currentGroup = null

    // Sort items by Y then X
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)

    sorted.forEach(it => {
      if (!currentGroup) {
        currentGroup = { ...it, endX: it.x + (it.str.length * 6 * scale) }
      } else {
        const yDiff = Math.abs(currentGroup.y - it.y)
        const xDiff = it.x - currentGroup.endX

        // If same line and close enough
        if (yDiff < 4 && xDiff < 15) {
          currentGroup.str += (xDiff > 4 ? ' ' : '') + it.str
          currentGroup.endX = it.x + (it.str.length * 6 * scale)
        } else {
          mergedItems.push(currentGroup)
          currentGroup = { ...it, endX: it.x + (it.str.length * 6 * scale) }
        }
      }
    })
    if (currentGroup) mergedItems.push(currentGroup)

    mergedItems.forEach(it => {
      const left = it.x, top = viewport.height - it.y
      const span = document.createElement('div')
      span.className = 'text-item'
      span.style.left = left + 'px'; span.style.top = top + 'px'

      const content = document.createElement('div')
      content.className = 'text-content'
      content.textContent = it.str
      span.appendChild(content)

      span.appendChild(this.createActionBar(span, () => this.handleDelete(pageNumber, it.idx, span, layer)))
      this.setupItem(span, it.idx, pageNumber, { x: left, y: top }, layer)
      layer.appendChild(span)
    })
  },

  addNewTextBox(pageNumber, id, values, layer) {
    const span = document.createElement('div')
    span.className = 'text-item'

    const x = values.rect ? values.rect.x : (values.x || 0)
    const y = values.rect ? values.rect.y : (values.y || 0)

    span.style.left = x + 'px'
    span.style.top = y + 'px'

    if (values.size) span.style.fontSize = values.size + 'px'
    if (values.bold) span.style.fontWeight = 'bold'
    if (values.color) span.style.color = values.color
    if (values.font) span.style.fontFamily = values.font

    const content = document.createElement('div')
    content.className = 'text-content'
    content.textContent = values.text || 'Nuovo Testo'
    span.appendChild(content)

    const idClean = id.replace('txt-', '')
    const actionBar = this.createActionBar(span, () => this.handleDelete(pageNumber, idClean, span, layer))
    span.appendChild(actionBar)

    this.setupItem(span, idClean, pageNumber, { x, y }, layer)
    layer.appendChild(span)

    if (id.startsWith('new-') || id.includes('new-')) {
      setTimeout(() => {
        span.classList.add('editing')
        content.contentEditable = 'true'
        content.focus()
        // Select all text for easy replacement
        const range = document.createRange()
        range.selectNodeContents(content)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        App.showFormattingBar(true, {
          font: span.style.fontFamily.replace(/['"]/g, '') || 'Helvetica',
          size: parseInt(span.style.fontSize) || 16,
          color: span.style.color || '#000000',
          bold: false, italic: false
        })
      }, 80)
    }
  }, // Close addNewTextBox

  renderImageItem(pageNumber, idx, imgData, layer) {
    const span = document.createElement('div')
    span.className = 'image-item'
    span.style.left = imgData.rect.x + 'px'
    span.style.top = imgData.rect.y + 'px'
    span.style.width = imgData.rect.w + 'px'
    span.style.height = imgData.rect.h + 'px'

    const img = document.createElement('img')
    img.src = imgData.dataUrl
    img.style.width = '100%'
    img.style.height = '100%'
    img.style.display = 'block'
    img.style.pointerEvents = 'none'
    span.appendChild(img)

    const handleDelete = () => {
      const pageImages = App.state.imageAdds[pageNumber] || []
      App.state.imageAdds[pageNumber] = pageImages.filter((_, i) => i !== idx)
      App.recordHistory({ type: 'imageRemove', pageNumber, idx, imgData })
      span.remove()
    }

    const actionBar = this.createActionBar(span, handleDelete)
    span.appendChild(actionBar)

    // Selection tracking for image effects
    span.addEventListener('click', () => {
      document.querySelectorAll('.image-item.selected').forEach(el => el.classList.remove('selected'))
      span.classList.add('selected')
    })

    // Move Logic
    let isDragging = false, startX, startY, origLX, origLY
    span.addEventListener('mousedown', e => {
      if (e.target.closest('.text-actions-bar')) return
      if (!e.target.closest('.move-handle') && e.target !== span) return
      isDragging = true; startX = e.clientX; startY = e.clientY
      origLX = parseFloat(span.style.left); origLY = parseFloat(span.style.top)
      span.style.cursor = 'grabbing'

      const onMove = ev => {
        if (isDragging) {
          const newX = origLX + (ev.clientX - startX)
          const newY = origLY + (ev.clientY - startY)
          span.style.left = newX + 'px'
          span.style.top = newY + 'px'
          imgData.rect.x = newX
          imgData.rect.y = newY
        }
      }

      const onUp = () => {
        isDragging = false; span.style.cursor = 'move'
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
    })

    this.setupResize(span, idx, pageNumber, true)
    layer.appendChild(span)
  },

  applyLiveFormat(elementId, changes) {
    const el = document.getElementById(elementId)
    if (!el) return
    if (changes.font) el.style.fontFamily = changes.font
    if (changes.size) el.style.fontSize = changes.size + 'px'
    if (changes.color) el.style.color = changes.color
    if (changes.bold !== undefined) el.style.fontWeight = changes.bold ? 'bold' : 'normal'
    if (changes.italic !== undefined) el.style.fontStyle = changes.italic ? 'italic' : 'normal'
  },

  reorder(fromPage, toPage) {
    const order = App.state.pageOrder.slice()
    const fromIdx = order.indexOf(fromPage), toIdx = order.indexOf(toPage)
    if (fromIdx < 0 || toIdx < 0) return
    order.splice(toIdx, 0, order.splice(fromIdx, 1)[0])
    App.state.pageOrder = order
    RenderService.renderAllPages(App.state.pdfDoc, order)
  }
}
window.RenderService = RenderService
