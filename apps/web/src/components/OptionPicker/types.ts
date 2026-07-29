/** One choice in a tool-type picker (#335) — a pencil grade, a charcoal type,
 *  a marker nib. Built by the call site from a schema descriptor's
 *  `enumOptions` plus its `optionPreviews`/`optionIcons`, so this component
 *  family never imports the schema itself. */
export interface PickerOption {
  value: string
  /** Already translated — the schema stores a TranslationKey, the caller
   *  resolves it (see SettingField). */
  label: string
  /** URL of a sample-stroke image (`assets/tool-types/…`). */
  image?: string
  /** Icon name for `<Icon>`, for options a photo of a stroke doesn't suit —
   *  the marker's two nibs, which differ in tip shape, not in tone. */
  icon?: string
}
