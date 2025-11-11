// Prevent browser from opening file when dropped
window.addEventListener('dragover', e => {
  e.preventDefault();
});
window.addEventListener('drop', e => {
  e.preventDefault();
});

const THEME_PRESETS = {
  default: {
    paper: '#ffffff',
    text: '#0b0b0b',
    muted: '#6f6f6f',
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    bodyFontSize: '14px'
  },
  'default-dark': {
    paper: '#121212',
    text: '#f5f5f5',
    muted: '#a0a0a0',
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial",
    bodyFontSize: '14px'
  },
  classic: {
    paper: '#fdf7ef',
    text: '#1f1a14',
    muted: '#887869',
    fontFamily: "'Garamond', 'Times New Roman', Times, serif",
    bodyFontSize: '13px'
  }
};

// Preferences modal wiring
const preferencesModal = document.getElementById('preferencesModal');
const prefUiDarkEl = document.getElementById('prefUiDark');
const prefAutosaveEl = document.getElementById('prefAutosave');
const cancelPrefsBtn = document.getElementById('cancelPrefsBtn');
const savePrefsBtn = document.getElementById('savePrefsBtn');

function openPreferences() {
  if (prefUiDarkEl) prefUiDarkEl.checked = !!uiSettings.uiDark;
  if (prefAutosaveEl) prefAutosaveEl.checked = !!uiSettings.autosave;
  if (preferencesModal) preferencesModal.classList.add('show');
}

if (window.electronAPI && window.electronAPI.onMenuPreferences) {
  window.electronAPI.onMenuPreferences(openPreferences);
}

if (cancelPrefsBtn) cancelPrefsBtn.addEventListener('click', () => {
  if (preferencesModal) preferencesModal.classList.remove('show');
});

if (savePrefsBtn) savePrefsBtn.addEventListener('click', () => {
  const nextUiDark = !!(prefUiDarkEl && prefUiDarkEl.checked);
  const nextAutosave = !!(prefAutosaveEl && prefAutosaveEl.checked);
  uiSettings.uiDark = nextUiDark;
  uiSettings.autosave = nextAutosave;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('uiDark', uiSettings.uiDark ? '1' : '0');
    localStorage.setItem('autosave', uiSettings.autosave ? '1' : '0');
  }
  applyUiTheme();
  if (preferencesModal) preferencesModal.classList.remove('show');
});

const LEGACY_PRESET_ALIASES = {
  light: 'default',
  dark: 'default-dark'
};

const PRESET_LABELS = {
  default: 'Default',
  'default-dark': 'Default (Dark)',
  classic: 'Classic'
};

// User info
let userInfo = {
  name: '',
  years: '',
  statement: '',
  instagram: '',
  username: '',
  email: '',
  portfolioLabel: 'Portfolio',
  themePreset: 'default',
  theme: { ...THEME_PRESETS.default }
};

// Portfolio state
let pages = [];

let isDirty = false;

// UI settings: dark mode and autosave
const uiSettings = (() => {
  const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
  const uiDarkPref = ls ? ls.getItem('uiDark') : null; // '1' | '0' | null
  const autosavePref = ls ? ls.getItem('autosave') : null;
  const systemDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
  return {
    uiDark: uiDarkPref === '1' ? true : uiDarkPref === '0' ? false : systemDark,
    autosave: autosavePref === '1'
  };
})();

function applyUiTheme() {
  try {
    if (document.body) {
      document.body.setAttribute('data-ui-theme', uiSettings.uiDark ? 'dark' : 'light');
    }
    if (window.electronAPI && window.electronAPI.setNativeTheme) {
      // Keep system unless explicitly set; dialogs follow themeSource
      const source = (typeof localStorage !== 'undefined' && localStorage.getItem('uiDark') !== null)
        ? (uiSettings.uiDark ? 'dark' : 'light')
        : 'system';
      window.electronAPI.setNativeTheme(source);
    }
  } catch {}
}
applyUiTheme();

// Follow system dark mode globally if no explicit user preference is set
try {
  const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  const onSchemeChange = (e) => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('uiDark') === null) {
      uiSettings.uiDark = !!e.matches;
      applyUiTheme();
    }
  };
  if (media) {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onSchemeChange);
    else if (typeof media.addListener === 'function') media.addListener(onSchemeChange);
  }
} catch {}

function setDirty(value) {
  const next = !!value;
  if (isDirty !== next) {
    isDirty = next;
    if (window.electronAPI && window.electronAPI.updateDirtyState) {
      try {
        window.electronAPI.updateDirtyState(next);
      } catch {}
    }
  }
}

function markDirty() {
  setDirty(true);
  scheduleAutosave();
}

function clearDirty() {
  setDirty(false);
}

let autosaveTimer = null;
function scheduleAutosave() {
  if (!uiSettings.autosave) return;
  const hasPath = (typeof localStorage !== 'undefined') && !!localStorage.getItem('lastPortfolioPath');
  if (!hasPath) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => { saveCurrentPortfolio(); }, 1500);
}

// Check if user info exists on load
async function loadUserInfo() {
  const ls = (typeof localStorage !== 'undefined') ? localStorage : null;
  const lastPath = ls && ls.getItem('lastPortfolioPath');
  if (lastPath && window.electronAPI && window.electronAPI.openPortfolioAt) {
    try {
      const res = await window.electronAPI.openPortfolioAt(lastPath);
      if (res && res.success && res.data) {
        const obj = JSON.parse(res.data);
        if (obj.userInfo) userInfo = obj.userInfo;
        if (obj.pages) pages = obj.pages;
        ensureThemeConsistency();
        applyThemeFromUserInfo();
        buildCoverPage();
        renderPages();
        clearDirty();
        if (ls) ls.setItem('hasRun', '1');
        return;
      }
    } catch {}
  }

  const hasRun = ls && ls.getItem('hasRun') === '1';
  if (!hasRun) {
    ensureThemeConsistency();
    syncStylePresetRadios();
    const m = document.getElementById('firstRunModal');
    if (m) m.classList.add('show');
    wireFirstRunHandlers();
    return;
  }
  // Subsequent runs: start with empty in-memory state until user opens or creates a portfolio
  ensureThemeConsistency();
  applyThemeFromUserInfo();
  buildCoverPage();
  renderPages();
}

function wireFirstRunHandlers() {
  const createBtn = document.getElementById('createPortfolioBtn');
  const openBtn = document.getElementById('openPortfolioBtn');
  if (createBtn) createBtn.onclick = async () => {
    try {
      const initial = JSON.stringify({ userInfo, pages }, null, 2);
      const res = await (window.electronAPI && window.electronAPI.createNewPortfolio ? window.electronAPI.createNewPortfolio(initial) : Promise.resolve({ success: false }));
      if (res && res.success) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('hasRun', '1');
          if (res.filePath) localStorage.setItem('lastPortfolioPath', res.filePath);
        }
        const m = document.getElementById('firstRunModal');
        if (m) m.classList.remove('show');
        const uim = document.getElementById('userInfoModal');
        if (uim) uim.classList.add('show');
      }
    } catch {}
  };
  if (openBtn) openBtn.onclick = async () => {
    try {
      const res = await (window.electronAPI && window.electronAPI.openPortfolio ? window.electronAPI.openPortfolio() : Promise.resolve({ success: false }));
      if (res && res.success && res.data) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('hasRun', '1');
          if (res.filePath) localStorage.setItem('lastPortfolioPath', res.filePath);
        }
        const m = document.getElementById('firstRunModal');
        if (m) m.classList.remove('show');
        try {
          const obj = JSON.parse(res.data);
          if (obj.userInfo) userInfo = obj.userInfo;
          if (obj.pages) pages = obj.pages;
          ensureThemeConsistency();
          applyThemeFromUserInfo();
          buildCoverPage();
          renderPages();
          clearDirty();
        } catch {
          alert('Invalid portfolio JSON');
        }
      }
    } catch {}
  };
}

// Save user info (no-op: persistence happens via portfolio Save)
async function saveUserInfo() {}

// User info form handler
document.getElementById('userInfoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const selectedPresetInput = document.querySelector('input[name="stylePreset"]:checked');
  const selectedPresetRaw = (selectedPresetInput && selectedPresetInput.value) || userInfo.themePreset;
  const selectedPreset = normalizePresetKey(selectedPresetRaw);
  const presetDefaults = getPresetDefaults(selectedPreset);
  const previousPreset = normalizePresetKey(userInfo.themePreset);
  const mergedTheme = selectedPreset !== previousPreset
    ? { ...presetDefaults }
    : { ...presetDefaults, ...(userInfo.theme || {}) };

  userInfo = {
    name: document.getElementById('userName').value,
    years: document.getElementById('userYears').value,
    statement: document.getElementById('userStatement').value,
    instagram: document.getElementById('userInstagram').value,
    username: document.getElementById('userUsername').value,
    email: document.getElementById('userEmail').value,
    portfolioLabel: userInfo.portfolioLabel || 'Portfolio',
    themePreset: selectedPreset,
    theme: mergedTheme
  };
  syncStylePresetRadios(selectedPreset);
  
  await saveUserInfo();
  document.getElementById('userInfoModal').classList.remove('show');
  applyThemeFromUserInfo();
  buildCoverPage();
  renderPages();
  markDirty();
});

// Build cover page
function buildCoverPage() {
  // Check if cover page already exists
  const coverIndex = pages.findIndex(p => p.type === 'cover');
  if (coverIndex >= 0) {
    pages[coverIndex].data = { ...userInfo };
  } else {
    pages.unshift({ type: 'cover', data: { ...userInfo }, image: null });
  }
}

// Create initial cover page if user info exists
function initializePages() {
  if (userInfo.name) {
    buildCoverPage();
    renderPages();
  }
}

function renderPages() {
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = '';
  
  if (pages.length === 0) {
    canvas.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">No pages yet. Add a project or drag an image to get started.</div>';
    renderPagesList();
    return;
  }
  
  pages.forEach((p, idx) => {
    const el = document.createElement('section');
    el.className = 'page ' + (p.type);
    el.dataset.index = String(idx);

    if (p.type === 'cover') {
      el.classList.add('cover');
      el.innerHTML = `
        <div class="label editable portfolio-label">${escapeHtml(p.data.portfolioLabel || 'Portfolio')}</div>
        <h1 class="editable name">${escapeHtml(p.data.name || 'Your Name')}</h1>
        ${p.data.years ? `<h2 class="editable years">${escapeHtml(p.data.years)}</h2>` : ''}
        ${p.data.statement ? `<div class="meta editable statement">${escapeHtml(p.data.statement)}</div>` : ''}
        <div class="links">
          ${p.data.instagram || p.data.username ? `
          <div class="social">
            ${p.data.instagram ? `<a class="icon" href="${escapeHtml(p.data.instagram)}" target="_blank" title="Instagram">
              <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2ZM12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10Zm0 1.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Zm5.25-.25a1 1 0 1 1 0-2a1 1 0 0 1 0 2Z'/></svg>
            </a>` : ''}
            ${p.data.username ? `<div class="username editable"><a href="${escapeHtml(p.data.instagram || '#')}" target="_blank">${escapeHtml(p.data.username)}</a></div>` : ''}
          </div>
          ` : ''}
          ${p.data.email ? `<div style="margin-top:6px" class="editable email"><a href="mailto:${escapeHtml(p.data.email)}">${escapeHtml(p.data.email)}</a></div>` : ''}
        </div>
      `;
    } else if (p.type === 'single') {
      el.classList.add('single');
      el.innerHTML = `
        <div class="image-wrap" data-idx="${idx}">${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.data.title || 'Image')}"/>` : `<div class="placeholder">Drop image here</div>`}</div>
        <div class="fixed-meta">
          <div class="title editable">${escapeHtml(p.data.title || 'Untitled')}</div>
          <div class="desc editable">${escapeHtml(p.data.desc)}</div>
        </div>
        <div class="fixed-year year editable">${escapeHtml(p.data.year || '')}</div>
      `;
    } else if (p.type === 'series-cover') {
      el.classList.add('series-cover');
      el.innerHTML = `
        <div class='series-cover'>
          <div class='series-header'>
            <div class='title editable'>${escapeHtml(p.data.title || 'Untitled Project')}</div>
            ${p.data.year ? `<div class='meta editable'>${escapeHtml(p.data.year)}</div>` : ''}
          </div>
          ${p.data.desc ? `<div class='series-desc editable'>${escapeHtml(p.data.desc)}</div>` : ''}
          <div class='series-info'>${escapeHtml(String(p.data.total || 0))} images · Project</div>
        </div>
      `;
    } else if (p.type === 'series-image') {
      let currentIndexInSeries = 0;
      for (let i = 0; i <= idx; i++) {
        if (pages[i].type === 'series-image' && pages[i].seriesTitle === p.seriesTitle) currentIndexInSeries++;
      }
      el.classList.add('series-image');
      el.innerHTML = `
        <div class="series-tag">Image ${currentIndexInSeries} of ${p.seriesTotal}</div>
        <div class="image-wrap" data-idx="${idx}">${p.image ? `<img src="${p.image}" alt="${escapeHtml(p.data.title || 'Image')}"/>` : `<div class="placeholder">Drop image for: ${escapeHtml(p.data.title || 'Image ' + currentIndexInSeries)}</div>`}</div>
        <div class="fixed-meta">
          <div class="title editable">${escapeHtml(p.data.title || 'Image ' + currentIndexInSeries)}</div>
          <div class="desc editable">${escapeHtml(p.data.desc || '')}</div>
        </div>
        <div class="fixed-year year editable">${escapeHtml(p.data.year || '')}</div>
      `;
    }
    canvas.appendChild(el);
  });
  attachPageInteractions();
  renderPagesList();
}

function renderPagesList() {
  const list = document.getElementById('pagesList');
  list.innerHTML = '';
  
  if (pages.length === 0) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No pages yet</div>';
    return;
  }
  
  pages.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'page-item';
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (p.image) {
      const im = document.createElement('img');
      im.src = p.image;
      thumb.appendChild(im);
    } else {
      thumb.textContent = (p.type === 'cover' ? 'C' : 'P');
      thumb.style.fontSize = '24px';
      thumb.style.color = 'var(--muted)';
      thumb.style.fontWeight = 'bold';
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `<div style="font-weight:600">${escapeHtml(p.data.title || p.data.name || p.type)}</div><div class="small">${escapeHtml(p.type)} — page ${i + 1}</div>`;
    const reorder = document.createElement('div');
    reorder.className = 'reorder';
    const up = document.createElement('button');
    up.className = 'btn secondary';
    up.textContent = '↑';
    up.onclick = () => { if (i > 0) { swapPages(i, i - 1); } };
    const down = document.createElement('button');
    down.className = 'btn secondary';
    down.textContent = '↓';
    down.onclick = () => { if (i < pages.length - 1) { swapPages(i, i + 1); } };
    const del = document.createElement('button');
    del.className = 'btn secondary';
    del.textContent = '×';
    del.style.color = '#ff4444';
    del.onclick = () => { deletePage(i); };
    reorder.appendChild(up);
    reorder.appendChild(down);
    reorder.appendChild(del);
    item.appendChild(thumb);
    item.appendChild(meta);
    item.appendChild(reorder);
    list.appendChild(item);
  });
}

function updateStyleTargetLabel() {
  const el = document.getElementById('styleTargetLabel');
  if (!el) return;
  const name = themeTarget === 'paper' ? 'Page' : themeTarget === 'text' ? 'Text' : 'Secondary Text';
  el.textContent = `Editing: ${name}`;
}

function swapPages(a, b) {
  [pages[a], pages[b]] = [pages[b], pages[a]];
  renderPages();
  markDirty();
}

function deletePage(index) {
  if (confirm('Are you sure you want to delete this page?')) {
    pages.splice(index, 1);
    renderPages();
    markDirty();
  }
}

// Page interactions
function attachPageInteractions() {
  document.querySelectorAll('#canvas .editable').forEach(el => {
    el.ondblclick = (e) => {
      e.stopPropagation();
      el.setAttribute('contenteditable', 'true');
      el.focus();
    };
    el.onblur = () => {
      el.removeAttribute('contenteditable');
      const pageEl = el.closest('.page');
      if (!pageEl) return;
      const idx = parseInt(pageEl.dataset.index, 10);
      if (isNaN(idx)) return;
      const p = pages[idx];
      if (el.classList.contains('name')) {
        p.data.name = el.innerText.trim();
        userInfo.name = p.data.name;
        saveUserInfo();
      }
      if (el.classList.contains('years')) {
        p.data.years = el.innerText.trim();
        userInfo.years = p.data.years;
        saveUserInfo();
      }
      if (el.classList.contains('statement')) {
        p.data.statement = el.innerText.trim();
        userInfo.statement = p.data.statement;
        saveUserInfo();
      }
      if (el.classList.contains('username')) {
        p.data.username = el.innerText.trim();
        userInfo.username = p.data.username;
        saveUserInfo();
      }
      if (el.classList.contains('email')) {
        p.data.email = el.innerText.trim();
        userInfo.email = p.data.email;
        const a = el.querySelector('a');
        if (a) {
          a.href = 'mailto:' + p.data.email;
          a.textContent = p.data.email;
        }
        saveUserInfo();
      }
      if (el.classList.contains('portfolio-label')) {
        const newLabel = el.innerText.trim();
        p.data.portfolioLabel = newLabel;
        userInfo.portfolioLabel = newLabel;
        saveUserInfo();
      }
      if (el.classList.contains('title')) p.data.title = el.innerText.trim();
      if (el.classList.contains('year')) p.data.year = el.innerText.trim();
      if (el.classList.contains('desc')) p.data.desc = el.innerText.trim();
      if (el.classList.contains('series-desc')) p.data.desc = el.innerText.trim();
      renderPagesList();
      markDirty();
    };
  });

  // Make each page image-wrap accept dropped images
  document.querySelectorAll('#canvas .image-wrap').forEach(w => {
    const idx = parseInt(w.dataset.idx, 10);
    if (isNaN(idx)) return;
    ['dragenter', 'dragover'].forEach(ev => w.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      w.classList.add('drag');
    }));
    ['dragleave', 'drop'].forEach(ev => w.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      w.classList.remove('drag');
    }));
    w.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.dataTransfer) return;
      const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type && f.type.startsWith('image'));
      if (files.length === 0) return;
      const file = files[0];
      const reader = new FileReader();
      reader.onload = async (ev) => {
        if (ev.target && typeof ev.target.result === 'string') {
          const dataUrl = ev.target.result;
          pages[idx].image = dataUrl;
          // Try EXIF year extraction
          try {
            const year = await extractExifYearFromDataUrl(dataUrl);
            if (year) {
              pages[idx].data.year = String(year);
            }
          } catch {}
          markDirty();
          renderPages();
        }
      };
      reader.readAsDataURL(file);
    });
  });
}

// Drag and drop - create single image page
const dz = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
  e.preventDefault();
  e.stopPropagation();
  dz.classList.add('drag');
}));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
  e.preventDefault();
  e.stopPropagation();
  dz.classList.remove('drag');
}));

dz.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!e.dataTransfer) return;
  const files = Array.from(e.dataTransfer.files).filter((f) => f.type && f.type.startsWith('image'));
  if (files.length === 0) return;
  
  // Create a single image page for each dropped image
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (ev.target && typeof ev.target.result === 'string') {
        const imageCount = pages.filter(p => p.type === 'single').length;
        const dataUrl = ev.target.result;
        const page = {
          type: 'single',
          data: { title: `Image ${imageCount + 1}`, year: '', desc: '' },
          image: dataUrl
        };
        pages.push(page);
        try {
          const year = await extractExifYearFromDataUrl(dataUrl);
          if (year) page.data.year = String(year);
        } catch {}
        markDirty();
        renderPages();
      }
    };
    reader.readAsDataURL(file);
  });
});

dz.addEventListener('click', async () => {
  if (window.electronAPI && window.electronAPI.selectImages) {
    try {
      const result = await window.electronAPI.selectImages();
      if (result.success && result.imageData) {
        const initialImageCount = pages.filter(p => p.type === 'single').length;
        result.imageData.forEach((dataUrl, index) => {
          const page = {
            type: 'single',
            data: { title: `Image ${initialImageCount + index + 1}`, year: '', desc: '' },
            image: dataUrl
          };
          pages.push(page);
        });
        markDirty();
        // Extract EXIF years asynchronously
        Promise.all(
          pages
            .slice(-result.imageData.length)
            .map(async (p) => {
              try {
                const year = await extractExifYearFromDataUrl(p.image);
                if (year) p.data.year = String(year);
              } catch {}
            })
        ).finally(() => renderPages());
      }
    } catch (err) {
      console.error('Error selecting images:', err);
      fileInput.click();
    }
  } else {
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []).filter((f) => f.type && f.type.startsWith('image'));
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (ev.target && typeof ev.target.result === 'string') {
        const imageCount = pages.filter(p => p.type === 'single').length;
        const dataUrl = ev.target.result;
        const page = {
          type: 'single',
          data: { title: `Image ${imageCount + 1}`, year: '', desc: '' },
          image: dataUrl
        };
        pages.push(page);
        try {
          const year = await extractExifYearFromDataUrl(dataUrl);
          if (year) page.data.year = String(year);
        } catch {}
        renderPages();
      }
    };
    reader.readAsDataURL(file);
  });
  fileInput.value = '';
});

// Add Project button
document.getElementById('addProjectBtn').addEventListener('click', () => {
  document.getElementById('projectModal').classList.add('show');
  document.getElementById('projectTitle').value = '';
  document.getElementById('projectYear').value = '';
  document.getElementById('projectDescription').value = '';
  document.getElementById('projectImages').value = '3';
});

window.closeProjectModal = function() {
  document.getElementById('projectModal').classList.remove('show');
}

document.getElementById('cancelProjectBtn').addEventListener('click', closeProjectModal);

document.getElementById('projectForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('projectTitle').value;
  const year = document.getElementById('projectYear').value;
  const desc = document.getElementById('projectDescription').value;
  const numImages = parseInt(document.getElementById('projectImages').value, 10);
  
  // Add series cover
  pages.push({
    type: 'series-cover',
    data: { title, year, desc, total: numImages },
    image: null,
    seriesTitle: title
  });
  
  // Add series images
  for (let i = 0; i < numImages; i++) {
    pages.push({
      type: 'series-image',
      data: { title: `Image ${i + 1}`, desc: '' },
      image: null,
      seriesTitle: title,
      seriesTotal: numImages
    });
  }
  
  window.closeProjectModal();
  renderPages();
  markDirty();
});

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- THEME / COLOR SETTINGS ---
function normalizePresetKey(preset) {
  const key = (preset && preset.trim()) || 'default';
  if (THEME_PRESETS[key]) return key;
  const alias = LEGACY_PRESET_ALIASES[key];
  if (alias && THEME_PRESETS[alias]) return alias;
  return 'default';
}

function getPresetDefaults(preset) {
  const key = normalizePresetKey(preset);
  return THEME_PRESETS[key] || THEME_PRESETS.default;
}

function ensureThemeConsistency() {
  const presetKey = normalizePresetKey(userInfo.themePreset);
  userInfo.themePreset = presetKey;
  const defaults = getPresetDefaults(presetKey);
  if (!userInfo.theme) {
    userInfo.theme = { ...defaults };
  } else {
    userInfo.theme = { ...defaults, ...userInfo.theme };
  }
  return userInfo.theme;
}

function syncStylePresetRadios(preset) {
  const target = normalizePresetKey(preset || userInfo.themePreset);
  const def = document.getElementById('stylePresetDefault');
  const dark = document.getElementById('stylePresetDefaultDark');
  const classic = document.getElementById('stylePresetClassic');
  if (def) def.checked = target === 'default';
  if (dark) dark.checked = target === 'default-dark';
  if (classic) classic.checked = target === 'classic';
}

function applyThemeFromUserInfo() {
  const theme = ensureThemeConsistency();
  try {
    const root = document.documentElement;
    if (document.body) {
      document.body.setAttribute('data-theme-preset', userInfo.themePreset);
    }
    if (theme.paper) root.style.setProperty('--page-paper', theme.paper);
    if (theme.text) root.style.setProperty('--page-text', theme.text);
    if (theme.muted) root.style.setProperty('--page-muted', theme.muted);
    if (theme.fontFamily) root.style.setProperty('--page-font-family', theme.fontFamily);
    if (theme.bodyFontSize) root.style.setProperty('--page-body-font-size', theme.bodyFontSize);
  } catch {}
  updateStylePresetControls();
}

let themeTarget = 'paper'; // 'paper' | 'text' | 'muted'
let workingTheme = null; // temporary edits while the modal is open
let workingPreset = null; // temporary preset while modal is open

function getActivePreset() {
  return normalizePresetKey(workingPreset || userInfo.themePreset);
}

function applyThemeFromWorkingTheme() {
  try {
    const root = document.documentElement;
    const activePreset = getActivePreset();
    const defaults = getPresetDefaults(activePreset);
    const t = workingTheme || userInfo.theme || defaults;
    if (document.body) {
      document.body.setAttribute('data-theme-preset', activePreset);
    }
    if (t.paper) root.style.setProperty('--page-paper', t.paper);
    if (t.text) root.style.setProperty('--page-text', t.text);
    if (t.muted) root.style.setProperty('--page-muted', t.muted);
    if (t.fontFamily) root.style.setProperty('--page-font-family', t.fontFamily);
    if (t.bodyFontSize) root.style.setProperty('--page-body-font-size', t.bodyFontSize);
  } catch {}
}
function openThemeModal() {
  const modal = document.getElementById('themeModal');
  if (!modal) return;
  modal.classList.add('show');
  // snapshot current theme to workingTheme
  workingPreset = userInfo.themePreset;
  const activePreset = getActivePreset();
  const defaults = getPresetDefaults(activePreset);
  const base = userInfo.theme ? { ...defaults, ...userInfo.theme } : defaults;
  workingTheme = { 
    paper: base.paper || defaults.paper, 
    text: base.text || defaults.text, 
    muted: base.muted || defaults.muted,
    fontFamily: base.fontFamily || defaults.fontFamily,
    bodyFontSize: base.bodyFontSize || defaults.bodyFontSize
  };
  // initialize with current target value
  syncThemeInputsToTarget();
  updateThemeButtonsActive();
  updateStyleTargetLabel();
  updateStylePresetControls();
  // initialize typography controls
  const ffSel = document.getElementById('fontFamilySelect');
  const fsInput = document.getElementById('fontSizeInput');
  if (ffSel) ffSel.value = workingTheme.fontFamily || defaults.fontFamily;
  if (fsInput) fsInput.value = parseInt((workingTheme.bodyFontSize || defaults.bodyFontSize), 10);
  if (ffSel) ffSel.onchange = () => {
    if (!workingTheme) workingTheme = { ...(userInfo.theme || defaults) };
    workingTheme.fontFamily = ffSel.value;
    applyThemeFromWorkingTheme();
  };
  if (fsInput) fsInput.oninput = () => {
    const n = parseInt(fsInput.value, 10);
    if (!isFinite(n)) return;
    const clamped = Math.max(8, Math.min(32, n));
    if (!workingTheme) workingTheme = { ...(userInfo.theme || defaults) };
    workingTheme.bodyFontSize = String(clamped) + 'px';
    applyThemeFromWorkingTheme();
  };
  // reset button for typography
  const resetTypographyBtn = document.getElementById('resetTypographyBtn');
  if (resetTypographyBtn) {
    resetTypographyBtn.onclick = () => {
      if (!workingTheme) workingTheme = { ...(userInfo.theme || defaults) };
      workingTheme.fontFamily = defaults.fontFamily;
      workingTheme.bodyFontSize = defaults.bodyFontSize;
      if (ffSel) ffSel.value = defaults.fontFamily;
      if (fsInput) fsInput.value = parseInt(defaults.bodyFontSize, 10);
      applyThemeFromWorkingTheme();
    };
  }
  toggleTypographyVisibility();
}

function closeThemeModal() {
  const modal = document.getElementById('themeModal');
  if (!modal) return;
  modal.classList.remove('show');
  // revert live preview to saved theme on cancel/close
  applyThemeFromUserInfo();
  workingTheme = null;
  workingPreset = null;
}

function normalizeToHex(value) {
  // Accepts #RGB, #RRGGBB or plain RRGGBB; returns #RRGGBB
  if (!value) return '#000000';
  let v = String(value).trim();
  if (v[0] !== '#') v = '#' + v;
  if (v.length === 4) {
    // #RGB -> #RRGGBB
    v = '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  // Basic validate
  const ok = /^#[0-9a-fA-F]{6}$/.test(v);
  return ok ? v.toUpperCase() : '#000000';
}

// Wire up Theme button and modal controls
const themeBtn = document.getElementById('themeBtn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    themeTarget = 'paper';
    openThemeModal();
  });
}

const choosePageColor = document.getElementById('choosePageColor');
const chooseTextColor = document.getElementById('chooseTextColor');
const chooseMutedColor = document.getElementById('chooseMutedColor');
function syncThemeInputsToTarget() {
  const colorPicker = document.getElementById('colorPicker');
  const hexInput = document.getElementById('hexInput');
  const defaults = getPresetDefaults(userInfo.themePreset);
  const current = (workingTheme && workingTheme[themeTarget]) || defaults[themeTarget] || '#000000';
  const hex = normalizeToHex(current);
  if (colorPicker) colorPicker.value = hex;
  if (hexInput) hexInput.value = hex;
}
if (choosePageColor) choosePageColor.addEventListener('click', () => {
  themeTarget = 'paper';
  syncThemeInputsToTarget();
  updateThemeButtonsActive();
  updateStyleTargetLabel();
  toggleTypographyVisibility();
});
if (chooseTextColor) chooseTextColor.addEventListener('click', () => {
  themeTarget = 'text';
  syncThemeInputsToTarget();
  updateThemeButtonsActive();
  updateStyleTargetLabel();
  toggleTypographyVisibility();
});
if (chooseMutedColor) chooseMutedColor.addEventListener('click', () => {
  themeTarget = 'muted';
  syncThemeInputsToTarget();
  updateThemeButtonsActive();
  updateStyleTargetLabel();
  toggleTypographyVisibility();
});

function toggleTypographyVisibility() {
  const typo = document.getElementById('typographyEditor');
  if (!typo) return;
  if (themeTarget === 'text' || themeTarget === 'muted') {
    typo.hidden = false;
  } else {
    typo.hidden = true;
  }
}

function updateThemeButtonsActive() {
  const map = {
    paper: choosePageColor,
    text: chooseTextColor,
    muted: chooseMutedColor,
  };
  [choosePageColor, chooseTextColor, chooseMutedColor].forEach(btn => {
    if (!btn) return;
    if (btn === map[themeTarget]) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  });
}

function updateStylePresetControls() {
  const summary = document.getElementById('stylePresetSummary');
  const select = document.getElementById('stylePresetSelect');
  const key = getActivePreset();
  if (summary) summary.textContent = PRESET_LABELS[key] || PRESET_LABELS.default;
  if (select) select.value = key;
}

const stylePresetSelectEl = document.getElementById('stylePresetSelect');
if (stylePresetSelectEl) {
  stylePresetSelectEl.addEventListener('change', (e) => {
    const selected = normalizePresetKey(e.target.value);
    workingPreset = selected;
    const defaults = getPresetDefaults(selected);
    workingTheme = { ...defaults };
    themeTarget = 'paper';
    applyThemeFromWorkingTheme();
    updateStylePresetControls();
    updateThemeButtonsActive();
    updateStyleTargetLabel();
    syncThemeInputsToTarget();
    const ffSel = document.getElementById('fontFamilySelect');
    const fsInput = document.getElementById('fontSizeInput');
    if (ffSel) ffSel.value = defaults.fontFamily;
    if (fsInput) fsInput.value = parseInt(defaults.bodyFontSize, 10);
    toggleTypographyVisibility();
  });
}

const colorPickerEl = document.getElementById('colorPicker');
const hexInputEl = document.getElementById('hexInput');
if (colorPickerEl) colorPickerEl.addEventListener('input', (e) => {
  const v = normalizeToHex(e.target.value);
  if (!workingTheme) workingTheme = { ...(userInfo.theme || getPresetDefaults(userInfo.themePreset)) };
  workingTheme[themeTarget] = v;
  if (hexInputEl) hexInputEl.value = v;
  applyThemeFromWorkingTheme();
});
if (hexInputEl) hexInputEl.addEventListener('input', (e) => {
  const v = normalizeToHex(e.target.value);
  if (!workingTheme) workingTheme = { ...(userInfo.theme || getPresetDefaults(userInfo.themePreset)) };
  workingTheme[themeTarget] = v;
  if (colorPickerEl) colorPickerEl.value = v;
  applyThemeFromWorkingTheme();
});

const cancelThemeBtn = document.getElementById('cancelThemeBtn');
if (cancelThemeBtn) cancelThemeBtn.addEventListener('click', closeThemeModal);

const saveThemeBtn = document.getElementById('saveThemeBtn');
if (saveThemeBtn) saveThemeBtn.addEventListener('click', async () => {
  // commit workingTheme
  if (workingTheme) {
    const presetKey = getActivePreset();
    userInfo.theme = { ...getPresetDefaults(presetKey), ...workingTheme };
    userInfo.themePreset = presetKey;
  }
  workingPreset = null;
  applyThemeFromUserInfo();
  await saveUserInfo();
  closeThemeModal();
  // Re-render pages to reflect any text color changes, etc.
  renderPages();
  markDirty();
});

// Reset button
const resetColorBtn = document.getElementById('resetColorBtn');
if (resetColorBtn) resetColorBtn.addEventListener('click', () => {
  const activePreset = getActivePreset();
  const defaults = getPresetDefaults(activePreset);
  if (!workingTheme) workingTheme = { ...(userInfo.theme || defaults) };
  const def = defaults[themeTarget] || '#000000';
  const defHex = normalizeToHex(def);
  workingTheme[themeTarget] = defHex;
  if (colorPickerEl) colorPickerEl.value = defHex;
  if (hexInputEl) hexInputEl.value = defHex;
  applyThemeFromWorkingTheme();
});

// --- EXIF Year Extraction ---
async function extractExifYearFromDataUrl(dataUrl) {
  try {
    const base64 = dataUrl.split(',')[1];
    if (!base64) return null;
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return extractExifYearFromBytes(bytes);
  } catch {
    return null;
  }
}

function extractExifYearFromBytes(bytes) {
  // Basic JPEG EXIF parser for DateTimeOriginal (0x9003)
  // Returns a 4-digit year if found, else null.
  let offset = 2; // skip SOI
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xFF) break;
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker === 0xE1) { // APP1
      const start = offset + 4;
      const end = start + size - 2;
      if (bytes[start] === 0x45 && bytes[start + 1] === 0x78 && bytes[start + 2] === 0x69 && bytes[start + 3] === 0x66 && bytes[start + 4] === 0x00 && bytes[start + 5] === 0x00) {
        const exifStart = start + 6;
        const view = new DataView(bytes.buffer, bytes.byteOffset + exifStart, end - exifStart);
        const tiffHeader = 0; // relative to exifStart
        const little = (view.getUint16(tiffHeader, false) === 0x4949);
        // sanity: if big endian signature, adjust
        const getU16 = (pos) => view.getUint16(pos, little);
        const getU32 = (pos) => view.getUint32(pos, little);
        const ifd0Offset = getU32(tiffHeader + 4);
        const exifIFDTag = 0x8769;
        const dateTimeOriginalTag = 0x9003;
        const exifIFDOffset = findIFDOffset(view, tiffHeader + ifd0Offset, exifIFDTag, little, tiffHeader);
        if (exifIFDOffset) {
          const dtoOffset = findIFDEntry(view, exifIFDOffset, dateTimeOriginalTag, little);
          if (dtoOffset) {
            const type = getU16(dtoOffset + 2);
            const count = getU32(dtoOffset + 4);
            let valOffset;
            if (type === 2) { // ASCII
              if (count <= 4) {
                valOffset = dtoOffset + 8;
              } else {
                const rel = getU32(dtoOffset + 8);
                valOffset = tiffHeader + rel;
              }
              const str = readAscii(view, valOffset, count);
              const year = parseYearFromExifDate(str);
              return year;
            }
          }
        }
      }
      break; // only check first APP1
    }
    if (size < 2) break;
    offset += 2 + size;
  }
  return null;
}

function findIFDOffset(view, ifdOffset, wantedTag, little, tiffHeader) {
  const getU16 = (pos) => view.getUint16(pos, little);
  const getU32 = (pos) => view.getUint32(pos, little);
  const numEntries = getU16(ifdOffset);
  for (let i = 0; i < numEntries; i++) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = getU16(entry);
    if (tag === wantedTag) {
      const rel = getU32(entry + 8);
      return tiffHeader + rel; // absolute offset inside TIFF view
    }
  }
  return null;
}

function findIFDEntry(view, ifdOffset, wantedTag, little) {
  const getU16 = (pos) => view.getUint16(pos, little);
  const numEntries = getU16(ifdOffset);
  for (let i = 0; i < numEntries; i++) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = getU16(entry);
    if (tag === wantedTag) return entry;
  }
  return null;
}

function readAscii(view, offset, count) {
  const chars = [];
  for (let i = 0; i < count && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    chars.push(String.fromCharCode(c));
  }
  return chars.join('');
}

function parseYearFromExifDate(s) {
  // Formats like "YYYY:MM:DD HH:MM:SS"
  const m = /^([0-9]{4})/.exec(s || '');
  return m ? m[1] : null;
}

// Export PDF: use Electron's printToPDF only (avoid OS printers)
async function exportPortfolioAsPDF() {
  if (!window.electronAPI || !window.electronAPI.exportPDF) {
    alert('PDF export is unavailable in this build.');
    return;
  }
  try {
    const res = await window.electronAPI.exportPDF();
    if (!res) return;
    if (res.success || res.canceled) return;
    if (res.error) alert('PDF export failed: ' + res.error);
  } catch (e) {
    alert('PDF export failed.');
  }
}

document.getElementById('printBtn').addEventListener('click', exportPortfolioAsPDF);

// Quick Save button and menu handlers
function getPortfolioPayload() {
  return JSON.stringify({ userInfo, pages }, null, 2);
}

async function saveCurrentPortfolio() {
  if (!window.electronAPI || !window.electronAPI.savePortfolio) return;
  try {
    const res = await window.electronAPI.savePortfolio(getPortfolioPayload());
    if (res && res.success) {
      clearDirty();
      if (typeof localStorage !== 'undefined' && res.filePath) {
        localStorage.setItem('lastPortfolioPath', res.filePath);
        localStorage.setItem('hasRun', '1');
      }
    }
  } catch (e) {}
}

const quickSaveBtn = document.getElementById('quickSaveBtn');
if (quickSaveBtn) quickSaveBtn.addEventListener('click', saveCurrentPortfolio);

if (window.electronAPI && window.electronAPI.onMenuSave) {
  window.electronAPI.onMenuSave(saveCurrentPortfolio);
}
if (window.electronAPI && window.electronAPI.onMenuExportPdf) {
  window.electronAPI.onMenuExportPdf(exportPortfolioAsPDF);
}
if (window.electronAPI && window.electronAPI.onMenuOpen) {
  window.electronAPI.onMenuOpen(async () => {
    try {
      const res = await window.electronAPI.openPortfolio();
      if (res && res.success && res.data) {
        const obj = JSON.parse(res.data);
        if (obj.userInfo) userInfo = obj.userInfo;
        if (obj.pages) pages = obj.pages;
        ensureThemeConsistency();
        applyThemeFromUserInfo();
        buildCoverPage();
        renderPages();
        clearDirty();
        if (typeof localStorage !== 'undefined' && res.filePath) {
          localStorage.setItem('lastPortfolioPath', res.filePath);
          localStorage.setItem('hasRun', '1');
        }
      }
    } catch {}
  });
}
if (window.electronAPI && window.electronAPI.onMenuNew) {
  window.electronAPI.onMenuNew(async () => {
    try {
      // reset to empty defaults
      pages = [];
      userInfo = {
        name: '', years: '', statement: '', instagram: '', username: '', email: '',
        portfolioLabel: 'Portfolio', themePreset: 'default', theme: { ...THEME_PRESETS.default }
      };
      ensureThemeConsistency();
      applyThemeFromUserInfo();
      const res = await window.electronAPI.createNewPortfolio(getPortfolioPayload());
      if (res && res.success) {
        const uim = document.getElementById('userInfoModal');
        if (uim) uim.classList.add('show');
        clearDirty();
        if (typeof localStorage !== 'undefined' && res.filePath) {
          localStorage.setItem('lastPortfolioPath', res.filePath);
          localStorage.setItem('hasRun', '1');
        }
      }
    } catch {}
  });
}

// Initialize
loadUserInfo();

// Zoom controls
const zoomSlider = document.getElementById('zoomSlider');
const zoomValueEl = document.getElementById('zoomValue');
const zoomControl = document.getElementById('zoomControl');
let zoomHideTimer = null;

function snap5(v) { return Math.round(v / 5) * 5; }

function applyZoomFromValue(val) {
  let v = parseInt(val, 10);
  if (isNaN(v)) v = 100;
  v = Math.max(50, Math.min(100, v));
  v = snap5(v);
  if (zoomSlider) zoomSlider.value = String(v);
  if (zoomValueEl) zoomValueEl.textContent = v + '%';
  const canvas = document.getElementById('canvas');
  if (canvas) {
    canvas.style.transformOrigin = 'top center';
    canvas.style.transform = `scale(${v / 100})`;
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem('zoom', String(v));
}

function showZoomOverlay() {
  if (zoomControl) zoomControl.classList.add('visible');
}
function hideZoomOverlayDelayed(ms = 1200) {
  if (zoomHideTimer) clearTimeout(zoomHideTimer);
  zoomHideTimer = setTimeout(() => {
    if (zoomControl && !zoomControl.matches(':hover')) zoomControl.classList.remove('visible');
  }, ms);
}

if (zoomSlider) {
  zoomSlider.addEventListener('input', (e) => {
    applyZoomFromValue(e.target.value);
    showZoomOverlay();
    hideZoomOverlayDelayed(800);
  });
}

// Reveal zoom control on canvas interaction
try {
  const canvas = document.getElementById('canvas');
  if (canvas) {
    canvas.addEventListener('mousemove', () => { showZoomOverlay(); hideZoomOverlayDelayed(1200); });
    canvas.addEventListener('mouseenter', () => { showZoomOverlay(); });
    canvas.addEventListener('mouseleave', () => { hideZoomOverlayDelayed(800); });
  }
  if (zoomControl) {
    zoomControl.addEventListener('mouseenter', () => { showZoomOverlay(); if (zoomHideTimer) clearTimeout(zoomHideTimer); });
    zoomControl.addEventListener('mouseleave', () => { hideZoomOverlayDelayed(600); });
  }
} catch {}
// Apply saved zoom on startup
try {
  const z = (typeof localStorage !== 'undefined') ? localStorage.getItem('zoom') : null;
  applyZoomFromValue(z ? parseInt(z, 10) : 100);
} catch { applyZoomFromValue(100); }

// Listen for reset command from main process
if (window.electronAPI && window.electronAPI.onResetPortfolio) {
  window.electronAPI.onResetPortfolio(() => {
    pages = [];
    userInfo = {
      name: '',
      years: '',
      statement: '',
      instagram: '',
      username: '',
      email: '',
      portfolioLabel: 'Portfolio',
      themePreset: 'default',
      theme: { ...THEME_PRESETS.default }
    };
    
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('userInfo');
    }
    
    const userInfoForm = document.getElementById('userInfoForm');
    if (userInfoForm) {
      userInfoForm.reset();
    }
    
    renderPages();
    applyThemeFromUserInfo();
    const userInfoModal = document.getElementById('userInfoModal');
    if (userInfoModal) {
      syncStylePresetRadios('default');
      userInfoModal.classList.add('show');
    }
    clearDirty();
  });
}

if (window.electronAPI && window.electronAPI.onRequestSaveBeforeExit && window.electronAPI.respondSaveBeforeExit) {
  window.electronAPI.onRequestSaveBeforeExit(async () => {
    try {
      const result = await window.electronAPI.savePortfolio(getPortfolioPayload());
      if (result && result.success) {
        clearDirty();
        if (typeof localStorage !== 'undefined' && result.filePath) {
          localStorage.setItem('lastPortfolioPath', result.filePath);
          localStorage.setItem('hasRun', '1');
        }
        window.electronAPI.respondSaveBeforeExit({ success: true, filePath: result.filePath });
      } else if (result && result.canceled) {
        window.electronAPI.respondSaveBeforeExit({ success: false, canceled: true });
      } else {
        window.electronAPI.respondSaveBeforeExit({ success: false, error: (result && result.error) || 'Unknown error' });
      }
    } catch (error) {
      window.electronAPI.respondSaveBeforeExit({ success: false, error: error && error.message ? error.message : String(error) });
    }
  });
}