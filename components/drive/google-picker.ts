'use client'

/**
 * Google Picker loader (browser only). Docs:
 * https://developers.google.com/workspace/drive/picker/guides/web-picker
 *
 * Needs two PUBLIC config values, inlined at build time:
 *   NEXT_PUBLIC_GOOGLE_PICKER_API_KEY         referrer-restricted browser key
 *   NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER   the app id (Cloud project number)
 * The OAuth token comes from /api/drive/picker-token (drive.file only).
 */

// Static literals so Next inlines them into the client bundle.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? ''
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER ?? ''

export function isPickerConfigured(): boolean {
  return API_KEY.length > 0 && APP_ID.length > 0
}

interface PickerDoc {
  id: string
  name?: string
  mimeType?: string
}
interface PickerResponse {
  action: string
  docs?: PickerDoc[]
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder
  enableFeature(feature: unknown): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(id: string): PickerBuilder
  setOrigin(origin: string): PickerBuilder
  setCallback(cb: (res: PickerResponse) => void): PickerBuilder
  build(): { setVisible(v: boolean): void }
}
interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: unknown) => { setIncludeFolders(v: boolean): unknown }
  ViewId: { DOCS: unknown }
  Feature: { MULTISELECT_ENABLED: unknown }
  Action: { PICKED: string; CANCEL: string }
}
interface GapiWindow {
  gapi?: { load(name: string, cb: () => void): void }
  google?: { picker?: PickerNamespace }
}

const SCRIPT_SRC = 'https://apis.google.com/js/api.js'
let loading: Promise<PickerNamespace> | null = null

function loadPicker(): Promise<PickerNamespace> {
  loading ??= new Promise<PickerNamespace>((resolve, reject) => {
    const w = window as unknown as GapiWindow
    const ready = (): void => {
      w.gapi!.load('picker', () => {
        const ns = w.google?.picker
        if (ns) resolve(ns)
        else reject(new Error('picker unavailable'))
      })
    }
    if (w.gapi) {
      ready()
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = ready
    script.onerror = () => reject(new Error('picker script failed'))
    document.head.appendChild(script)
  }).catch((err: unknown) => {
    loading = null
    throw err
  })
  return loading
}

/**
 * Open the Picker and resolve with the chosen file ids ([] on cancel). Each
 * picked file becomes accessible to lee under drive.file.
 */
export async function pickDriveFiles(accessToken: string): Promise<string[]> {
  const ns = await loadPicker()
  return new Promise<string[]>((resolve) => {
    const view = new ns.DocsView(ns.ViewId.DOCS)
    view.setIncludeFolders(false)
    const picker = new ns.PickerBuilder()
      .addView(view)
      .enableFeature(ns.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setOrigin(window.location.origin)
      .setCallback((res) => {
        if (res.action === ns.Action.PICKED) resolve((res.docs ?? []).map((d) => d.id))
        else if (res.action === ns.Action.CANCEL) resolve([])
      })
      .build()
    picker.setVisible(true)
  })
}
