// ==UserScript==
// @name         Classifier
// @namespace    KrzysztofKruk-FlyWire
// @version      0.5.1
// @description  Helps grouping cells of the same type
// @author       Krzysztof Kruk
// @match        https://ngl.flywire.ai/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/ChrisRaven/FlyWire-Classifier/main/Classifier.user.js
// @downloadURL  https://raw.githubusercontent.com/ChrisRaven/FlyWire-CLassifier/main/Classifier.user.js
// @homepageURL  https://github.com/ChrisRaven/FlyWire-Classifier
// ==/UserScript==

if (!document.getElementById('dock-script')) {
  let script = document.createElement('script')
  script.id = 'dock-script'
  script.src = typeof DEV !== 'undefined' ? 'http://127.0.0.1:5501/FlyWire-Dock/Dock.js' : 'https://chrisraven.github.io/FlyWire-Dock/Dock.js'
  document.head.appendChild(script)
}

let wait = setInterval(() => {
  if (globalThis.dockIsReady) {
    clearInterval(wait)
    main()
  }
}, 100)


let storage
let classified
let lastClassified = -1

const NO_OF_LABELS = 30
const defaultLabels = [
  'Centrifugal (C)',
  'Distal medulla (Dm)',
  'Lamina intrinsic (Lai)',
  'Lamina monopolar (L)',
  'Lamina wide field (Lawf)',
  'Lobula columnar (Lc)',
  'Lobula-lobula plate columnar (LLPC)',
  'Lobula plate-lobula columnar (LPLC)',
  'Lobula intrinsic (Li)',
  'Lobula plate intrinsic (Lpi)',
  'Lobula tangential (Lt)',
  'Medulla intrinsic (Mi)',
  'Medulla tangential (Mt)',
  'Optic lobe tangential (Olt)',
  'Proximal medulla (Pm)',
  'Retinula axon (R)',
  'T',
  'Translobula (Tl)',
  'Translobula-plate (Tlp)',
  'Transmedullary (Tm)',
  'Transmedullary Y (TmY)',
  'Y',
  'unknown',
  'other'
]

let currentLabels = defaultLabels
let classifyHighlighted = false
let useArrows = false


function fix_editableLabels_2022_11_17() {
  if (Dock.ls.get('fix_editableLabels_2022_11_17') === 'fixed') return

  storage.get('kk-classifier').then(res => {
    let saved = res['kk-classifier']

    if (!saved) {
      Dock.ls.set('fix_editableLabels_2022_11_17', 'fixed')
      return
    }

    let toBeSaved = {
      labels: defaultLabels,
      entries: []
    }

    for (const [key, value] of Object.entries(saved)) {
      let index = toBeSaved.labels.indexOf(key)
      toBeSaved.entries[index] = value
    }

    for (let i = 0; i < defaultLabels.length; i++) {
      if (!toBeSaved.entries[i]) {
        toBeSaved.entries[i] = []
      }
    }

    storage.set('kk-classifier', { value: toBeSaved }).then(() => {
      Dock.ls.set('fix_editableLabels_2022_11_17', 'fixed')
    })
  })
}


function main() {
  storage = window.Sifrr.Storage.getStorage('indexeddb')

  fix_editableLabels_2022_11_17()

  getEntries()

  let dock = new Dock()

  dock.addAddon({
    name: 'Classifier',
    id: 'kk-classifier',
    html: generateHtml()
  })

  function generateHtml() {
    return /*html*/`
      <label>
        <input type="checkbox" id="kk-classifier-element-selection">Classify highlighted element
      </label><br />
      <label>
        <input type="checkbox" id="kk-classifier-use-arrows">Use arrows
      </label>
    `
  }

  classifyHighlighted = Dock.ls.get('classifier-element-selection-highlighted') === 'true'
  document.getElementById('kk-classifier-element-selection').checked = classifyHighlighted

  useArrows = Dock.ls.get('classifier-use-arrows') === 'true'
  document.getElementById('kk-classifier-use-arrows').checked = useArrows


  let id

  const topBar = document.getElementsByClassName('neuroglancer-viewer-top-row')[0]
  const button = document.createElement('button')
  button.id = 'kk-classifier-get-classified'
  button.textContent = 'Get classified cells'
  button.addEventListener('click', getClassifiedCellsHandler)

  const undoButton = document.getElementById('neuroglancer-undo-button')
  topBar.insertBefore(button, undoButton)

  document.addEventListener('contextmenu', e => {
    if (!e.target.classList.contains('segment-color-selector')) return

    id = e.target.parentNode.parentNode.getElementsByClassName('segment-button')[0].dataset.segId

    let list = `<select id="classifier-list" multiple size=${NO_OF_LABELS}>`
    list += classified.labels.reduce((prev, current) => {
      return prev + '<option>' + current +  '</option>'
    }, '')
    list += '</select>'

    Dock.dialog({
      id: 'classifier-select',
      destroyAfterClosing: true,
      okCallback: okCallback,
      html: list,
      width: 250,
      cancelCallback: () => {}
    }).show()
  })

  function okCallback() {
    const el = document.getElementById('classifier-list')
    const sel = el.options[el.selectedIndex].text

    addEntry(sel, id)
  }

  addCss()


  function uncheckAll() {
    document.querySelectorAll('.segment-div > .segment-checkbox').forEach(el => {
      if (el.checked) {
        el.click()
      }
    })
  }

  document.addEventListener('keyup', e => {
    if (document.activeElement) {
      const tagName = document.activeElement.tagName.toLowerCase()
      if (tagName === 'input' || tagName === 'textarea') return
    }

    let id = -1
    if (!classifyHighlighted) {
      id = document.querySelector('.segment-div > .segment-checkbox:checked')
      if (id) {
        id = id.parentElement.getElementsByClassName('segment-button')[0].dataset.segId
      }
    }
    else {
      id = document.querySelector('.selected-segment-button > .segment-button')
      if (id) {
        id = id.dataset.segId
      }
    }

    let index = -1

    let ev, panel
    let current

    switch (e.key) {
      case 'q':
        if (e.ctrlKey) {
          if (lastClassified > -1) {
            classified.entries[lastClassified].pop()
            saveEntries()
            
            lastClassified = -1
          }
        }
        else {
          index = 0
        }

        break
      case 'w': index = 1; break
      case 'e':
        index = 2

        ev = new Event('action:rotate-relative-z-')
        panel = document.querySelector('.neuroglancer-rendered-data-panel button[title="Switch to 3d layout."]')

        if (!panel) {
          panel = document.querySelector('.neuroglancer-rendered-data-panel button[title="Switch to 4panel layout."]')
        }
        if (panel) {
          panel.parentElement.parentElement.dispatchEvent(ev)
        }

        break
      case 'r':
        index = 3

        ev = new Event('action:rotate-relative-z+')
        panel = document.querySelector('.neuroglancer-rendered-data-panel button[title="Switch to 3d layout."]')
        if (!panel) {
          panel = document.querySelector('.neuroglancer-rendered-data-panel button[title="Switch to 4panel layout."]')
        }
        if (panel) {
          panel.parentElement.parentElement.dispatchEvent(ev)
        }
        
        break
      case 't': index = 4; break
      case 'y': index = 5; break
      case 'x': document.querySelector('.selected-segment-button input[type="checkbox"]').click(); break
      case 'd':
        let element
        if (classifyHighlighted) {
          element = document.querySelector('.selected-segment-button > .segment-button')
        }
        else {
          element = document.querySelector('.segment-div > .segment-checkbox:checked').parentElement.getElementsByClassName('segment-button')[0]
        }
        if (element) {
          element.click()
        }
        break

      case 'ArrowRight':
        if (!useArrows) return

        current = document.querySelector('.segment-div > .segment-checkbox:checked')
        uncheckAll()
        if (!current) {
          current = document.querySelector('.segment-div > .segment-checkbox')
          current.click() // check the first segment
          current.scrollIntoView()
        }
        else {
          let next = current.parentElement.nextSibling

          if (next) {
            next.getElementsByClassName('segment-checkbox')[0].click()
            next.scrollIntoView()
          }
          else {
            current.click()
          }
        }

        break

      case 'ArrowLeft':
        if (!useArrows) return

        current = document.querySelector('.segment-div > .segment-checkbox:checked')
        uncheckAll()
        if (!current) {
          current = document.querySelector('.segment-div > .segment-checkbox')
          current.click() // check the first segment
          current.scrollIntoView()
        }
        else {
          let previous = current.parentElement.previousSibling

          if (previous && previous.id !== 'kk-utilities-action-menu') {
            previous.getElementsByClassName('segment-checkbox')[0].click()
            previous.scrollIntoView()
          }
          else {
            current.click()
          }
        }

        break
    }

    if (index > -1) {
      lastClassified = index
      addEntry(classified.labels[index], id)
    }
  })

  document.getElementById('kk-classifier-element-selection').addEventListener('change', (e) => {
      Dock.ls.set('classifier-element-selection-highlighted', e.target.checked)
      classifyHighlighted = e.target.checked
  })

  document.getElementById('kk-classifier-use-arrows').addEventListener('change', (e) => {
    Dock.ls.set('classifier-use-arrows', e.target.checked)
    useArrows = e.target.checked
})

}

function saveEntries() {
  storage.set('kk-classifier', { value: classified })
}


function getIndex(label) {
  return classified.labels.indexOf(label)
}


function addEntry(label, id, clear = false) {
  const index = getIndex(label)
  if (index > -1) {
    if (!classified.entries[index]) {
      classified.entries[index] = []
    }
    classified.entries[index].push(id)
    saveEntries()
  }
}


function clearEntry(label) {
  classified.labels.forEach((el, i) => {
    if (el === label) {
      classified.entries[i] = []
    }
  })
  saveEntries()
}

function getEntries() {
  storage.get('kk-classifier').then(res => {
    classified = res['kk-classifier']
    if (!classified) {
      classified = {
        labels: defaultLabels,
        entries: []
      }
    }
  })
}


function getClassifiedCellsHandler() {
  const labels = classified.labels
  const entries = classified.entries

  let html = '<button id="kk-classifier-copy-all">Copy All</button>'
  html += '<button id="kk-classifier-edit-labels">Edit Labels</button>'
  html += '<table id="kk-classifier-table">'
  for (let i = 0; i < NO_OF_LABELS; i++) {
    let label = labels[i]
    let entry = entries[i]

    html += `
      <tr data-label="${label || ''}">
        <td class="kk-classifier-labels">${label || ''}</td>
        <td class="kk-classifier-ids">${Array.isArray(entry) ? entry.join(', ') : ''}</td>
        <td class="kk-classifier-buttons">
          <button class="kk-classifier-copy">Copy</button>
          <button class="kk-classifier-remove">Remove</button>
        </td>
      </tr>
    `
  }
  html += '</table>'

  const afterCreateCallback = () => {
    document.getElementById('kk-classifier-table').addEventListener('click', e => {
      if (e.target.classList.contains('kk-classifier-copy')) {
        const ids = e.target.parentNode.previousElementSibling.textContent.trim()
        navigator.clipboard.writeText(ids)
      }
      else if (e.target.classList.contains('kk-classifier-remove')) {
        const label = e.target.parentNode.parentNode.dataset.label
        clearEntry(label)
        e.target.parentNode.previousElementSibling.textContent = ''
      }
    })

    document.getElementById('kk-classifier-copy-all').addEventListener('click', e => {
      let str = ''
      let label, entries
      for (let i = 0; i < classified.labels.length; i++) {
        label = classified.labels[i]
        entries = classified.entries[i]
        if (label && entries && entries.length) {
          str += label + '\r\n' + entries.join(', ') + '\r\n\r\n'
        }
      }
      navigator.clipboard.writeText(str)
    })

    document.getElementById('kk-classifier-edit-labels').addEventListener('click', editLabelsHandler)
  }

  Dock.dialog({
    id: 'kk-classifier-show-entries',
    html: html,
    okCallback: () => {},
    afterCreateCallback: afterCreateCallback,
    destroyAfterClosing: true,
    width: 840
  }).show()
}


function editLabelsHandler() {
  const labels = classified.labels
  let html = '<button id="kk-classifier-restore-default-labels" title="Restore labels to types existing in the optic lobe">Restore default labels</button>';
  for (let i = 0; i < NO_OF_LABELS; i++) {
    html += `<input class="kk-classifier-label-name" value="${labels[i] || ''}"><br />`
  }

  Dock.dialog({
    id: 'kk-classifier-edit-labels-dialog',
    html: html,
    width: 310,
    destroyAfterClosing: true,
    afterCreateCallback: afterCreateCallback,
    okCallback: okCallback,
    cancelCallback: () => {}
  }).show()

  function afterCreateCallback() {
    document.getElementById('kk-classifier-restore-default-labels').addEventListener('click', () => {
      const inputs = document.getElementsByClassName('kk-classifier-label-name')
      const labels = document.getElementsByClassName('kk-classifier-labels')
      for (let i = 0; i < NO_OF_LABELS; i++) {
        inputs[i].value = defaultLabels[i] || ''
      }
    })
  }

  function okCallback() {
    let labels = []
    const tableRows = document.querySelectorAll('#kk-classifier-table tr')
    document.getElementsByClassName('kk-classifier-label-name').forEach((el, index) => {
      labels.push(el.value)
      tableRows[index].firstElementChild.textContent = el.value
    })
    classified.labels = labels
    saveEntries()
  }
}


function addCss() {
  Dock.addCss(/*css*/`
    #classifier-list {
      overflow: hidden;
      background-color: #222;
      color: white;
      padding: 15px;
    }

    #kk-classifier-show-entries > div.content {
      height: 80vh;
      overflow: auto;
    }

    .content button#kk-classifier-edit-labels {
      width: 100px;
    }

    .kk-classifier-ids {
      font-size: 12px;
    }

    #kk-classifier-table {
      padding: 10px;
    }

    #kk-classifier-table td {
      padding: 5px;
    }

    #kk-classifier-table tr:nth-child(even) {
      background-color: #333;
    }

    .kk-classifier-buttons {
      min-width: 160px;
    }

    .kk-classifier-label-name {
      width: 300px;
      padding: 2px;
      margin: 1px;
    }

    .content #kk-classifier-restore-default-labels {
      width: 150px;
      margin-bottom: 10px;
    }
  `)
}
