// ==UserScript==
// @name         Classifier
// @namespace    KrzysztofKruk-FlyWire
// @version      0.1
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


function main() {

  let storage = window.Sifrr.Storage.getStorage('indexeddb')
  let id

  const topBar = document.getElementsByClassName('neuroglancer-viewer-top-row')[0]
  const button = document.createElement('button')
  button.id = 'kk-classifier-get-classified'
  button.textContent = 'Get classified cells'
  button.addEventListener('click', () => {
    storage.get('kk-classifier').then(res => {
      let saved = res['kk-classifier']

      if (!saved) return

      let html = '<table id="kk-classifier-table">'
      for (const [key, value] of Object.entries(saved)) {
        html += `
          <tr data-key="${key}">
            <td>${key}</td>
            <td>${value.join(', ')}</td>
            <td><button class="kk-classifier-copy">Copy</button></td>
            <td><button class="kk-classifier-remove">Remove</button></td>
          </tr>
        `
      }
      html += '</table>'

      const afterCreateCallback = () => {
        document.getElementById('kk-classifier-table').addEventListener('click', e => {
        
          if (e.target.classList.contains('kk-classifier-copy')) {
            const ids = e.target.parentNode.previousSibling.textContent
            navigator.clipboard.writeText(ids)
          }
          else if (e.target.classList.contains('kk-classifier-remove')) {
            const key = e.target.parentNode.parentNode.dataset.key
            save(key, null, true)
            e.target.parentNode.parentNode.remove()
          }

        })
      }

      Dock.dialog({
        id: 'kk-classifier-show-entries',
        html: html,
        okCallback: () => {},
        afterCreateCallback: afterCreateCallback,
        destroyAfterClosing: true,
        width: 800
      }).show()

    })
  })
  const undoButton = document.getElementById('neuroglancer-undo-button')
  topBar.insertBefore(button, undoButton)

  document.addEventListener('contextmenu', e => {
    if (!e.target.classList.contains('segment-color-selector')) return

    id = e.target.parentNode.getElementsByClassName('segment-button')[0].dataset.segId

    const types = ['Centrifugal (C)',
    'Distal medulla (Dm)',
    'Lamina intrinsic (Lai)',
    'Lamina monopolar (L)',
    'Lamina wide field (Lawf)',
    'Lobula columnar (Lc)',
    'Lobula-complex columnar (Lccn)',
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

  const list = '<select id="classifier-list" multiple size=25 style="overflow:hidden;">' + types.reduce((prev, current) => {
    return prev + '<option>' + current +  '</option>'
  }, '') + '</select>'

    Dock.dialog({
      id: 'classifier-select',
      destroyAfterClosing: true,
      okCallback: okCallback,
      html: list,
      cancelCallback: () => {}
    }).show()
  })

  function okCallback() {
    const el = document.getElementById('classifier-list')
    const sel = el.options[el.selectedIndex].text

    save(sel, id)
  }

  function save(sel, id, clear = false) {
    storage.get('kk-classifier').then(res => {
      let saved = res['kk-classifier']
      if (!saved) {
        saved = {}
      }

      if (clear) {
        delete saved[sel]
      }
      else {
       if (!saved[sel]) {
          saved[sel] = []
        }
        saved[sel].push(id)
      }
      storage.set('kk-classifier', { value: saved })
    })
  }
}