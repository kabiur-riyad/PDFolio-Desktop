# PDFolio

A minimalist desktop application for creating beautiful, print-ready photography portfolios.


## Features

-   📸 **Drag & Drop**: Easily add images to build your portfolio.
-   🎨 **Minimalist Design**: A clean and professional layout.
-   📄 **Export as PDF**: Export to a print-ready A4 PDF (Ctrl/Cmd+Shift+E).
-   💾 **File-based Save & Open**: Save your portfolio as a JSON file and open it later.
-   ✏️ **Inline Editing**: Double-click any text to edit it directly.
-   🔄 **Easy Reordering**: Use the sidebar controls to reorder pages.
-   🖼️ **Flexible Layouts**: Supports both single images and multi-image project series.
-   ⚙️ **Preferences**: Dark Mode and Autosave toggles (Edit → Preferences… or Ctrl/Cmd+,).
-   🌙 **Dark Mode**: Follows your system theme by default; can be forced in Preferences.
-   🔁 **Autosave**: Automatically saves changes after a short idle when enabled.
-   🧭 **Zoom Control**: Bottom-right overlay to zoom 50%–100% with smooth snapping.
-   🛟 **Unsaved-changes Protection**: Save & Exit / Exit Without Saving / Cancel prompts.
-   🚀 **Fast Start**: Remembers and auto-opens the last portfolio file you worked on.


## Download & Installation (Recommended)

The easiest way to get started is to download the latest pre-compiled version for your operating system.

1.  Go to the [**Releases Page**](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY/releases) on GitHub.
2.  Under the latest release, find the installer for your system (e.g., `PDFolio-Setup-x.x.x.exe` for Windows).
3.  Download and run the installer.

---

## For Developers: Building from Source

If you want to modify the code or build the application yourself, follow these steps.

### 1. Prerequisites

-   You must have **Node.js** installed. [Download the LTS version here](https://nodejs.org/).

### 2. Installation

Open your terminal, navigate to the project folder, and run:

```bash
npm install
```

This will download all the necessary dependencies for the project.

### 3. Running the App

To launch the application in development mode, run:

```bash
npm start
```

### 4. How to Build the Application

You can package the application into a distributable format to share with others.

-   **For Windows (.exe)**:
    ```bash
    npm run build:win
    ```

-   **For macOS (.dmg)**:
    ```bash
    npm run build:mac
    ```

-   **For Linux (.AppImage)**:
    ```bash
    npm run build:linux
    ```

After the build process is complete, you will find the installer and application files in the `dist` directory.

## Preferences

- Open via Edit → Preferences… or Ctrl/Cmd+,
- Toggle UI Dark Mode and Autosave.
- If you haven’t set Dark Mode explicitly, the app follows your OS theme automatically.

## Zoom Control

- Use the bottom-right overlay to zoom between 50% and 100%.
- Snaps in 5% increments and animates smoothly; auto-hides when idle.

## Keyboard Shortcuts

- Export as PDF: Ctrl/Cmd+Shift+E
- Save: Ctrl/Cmd+S
- Preferences: Ctrl/Cmd+,

## License

MIT
