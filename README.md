# Edit Canvas Free

Edit Canvas Free is a free, modern, web-based canvas and PDF editor inspired by Canva. It lets you edit PDFs, draw freehand, add shapes and text, and export your work directly from your browser. No account required.

- **Live Demo:** [https://editcanvasfree.netlify.app](https://editcanvasfree.netlify.app)
- **GitHub:** [https://github.com/jeaders/Edit-Canvas-Free](https://github.com/jeaders/Edit-Canvas-Free)

## What is Edit Canvas Free?

Edit Canvas Free is an open-source graphic editor built for everyday design work. Whether you're annotating a PDF, creating a simple graphic, or sketching ideas, it combines a flexible canvas with practical PDF editing tools in one lightweight web app.

## What Does It Do?

- **Edit PDFs** – Modify text, move elements, and overlay shapes or drawings on PDF pages.
- **Freehand Drawing** – Draw with a pen tool and erase with the eraser for quick annotations or sketches.
- **Shapes & Elements** – Add rectangles, ellipses, triangles, lines, and polygons to your designs.
- **Text Editing** – Create and customize text boxes with full positioning and resizing.
- **Layers Panel** – Organize your work with a built-in layers panel that separates text, images, shapes, and drawings.
- **Asset Library** – Access ready-to-use graphic elements from the Resources panel and drag them onto the canvas.
- **Import Files** – Drag and drop PDFs or images directly into the editor. Images are automatically converted and placed on the canvas.
- **Alignment Tools** – Toggle the alignment grid to keep elements perfectly aligned.
- **Export** – Export the current page or canvas as a high-quality PNG image.
- **Clean UI** – Canva-style interface with a contextual toolbar for a smooth editing experience.

## Use It Online (Recommended)

The easiest way to use Edit Canvas Free is directly in your browser. No installation or setup required:

[https://editcanvasfree.netlify.app](https://editcanvasfree.netlify.app)

## Run Locally

If you'd like to run Edit Canvas Free on your own machine, follow these steps:

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- npm (comes with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jeaders/Edit-Canvas-Free.git
   cd Edit-Canvas-Free
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at [http://localhost:5173](http://localhost:5173). The page will automatically reload when you make changes.

### Build for Production

To create an optimized production build:

```bash
npm run build
```

### Preview the Production Build

To test the built version locally:

```bash
npm run serve
```

## Tech Stack

- [Vite](https://vitejs.dev/) – Lightning-fast build tool and dev server
- [Vanilla JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript) – Lightweight, no framework lock-in
- [PDF.js](https://mozilla.github.io/pdf.js/) – PDF rendering and manipulation in the browser

## License

Edit Canvas Free is free and open-source. You are free to use it for personal or commercial projects.
