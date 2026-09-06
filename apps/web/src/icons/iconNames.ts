// The complete set of icons this app is allowed to draw (#322).
//
// This list is the source of truth in the same sense the English dictionary is
// for i18n: the subsetted font shipped in src/assets/fonts/ contains exactly
// these glyphs and nothing else, so a name that is not here has no glyph to
// render. Making it a union type rather than `string` is what keeps that from
// becoming a silent failure — `<Icon name="delete_sweep" />` is a typecheck
// error today, instead of an invisible button discovered on a tablet later.
//
// Adding an icon is two steps, and the second is not optional:
//   1. add the Material Symbols name here, in alphabetical order,
//   2. run `npm run bake:icon-font`.
// Skipping (2) also fails to compile rather than shipping a hole: the
// generated codepoint map is typed as a total Record over this union, so a
// name without a baked glyph leaves a missing key.
export const MATERIAL_ICON_NAMES = [
  'ac_unit',
  'account_circle',
  'add',
  'add_photo_alternate',
  'brush',
  // #547 — the digital brush. 'brush' is the brush pen's, and the two must not
  // share a glyph: they sit next to each other in the bar and are the pair a
  // user is most likely to confuse (one imitates a nib, the other imitates
  // nothing).
  'format_paint',
  'change_history',
  'check',
  'check_box',
  'check_box_outline_blank',
  'check_circle',
  'chevron_right',
  'close',
  'cloud_off',
  'cloud_sync',
  'colorize',
  'content_copy',
  'content_cut',
  'content_paste',
  'create_new_folder',
  'delete',
  'delete_forever',
  'deselect',
  'download',
  'draw',
  'drag_indicator',
  'edit',
  'edit_note',
  'error',
  'expand_more',
  'fit_screen',
  'format_color_fill',
  'folder',
  'folder_open',
  'fullscreen',
  'fullscreen_exit',
  'gradient',
  'grid_on',
  'grid_view',
  'group',
  'highlight_alt',
  // The badge on a slot that holds a *role* rather than a
  // fixed tool — "whatever I last drew with" — worn in the corner of that
  // tool's own icon. Without it the chooser shows two identical pencils.
  'history',
  'image_not_supported',
  'info',
  'ink_eraser',
  'ink_highlighter',
  'keyboard_arrow_down',
  'keyboard_arrow_up',
  'layers',
  'lock',
  'lock_open',
  'lock_person',
  'logout',
  'menu',
  'more_vert',
  'move_down',
  'palette',
  'water_drop',
  // #468 v4 — the watercolor mix presets (dry / damp / wet). A trio by design:
  // three variants of one glyph read as points on a scale, which is what the
  // setting is, where three unrelated pictures would read as three modes.
  'humidity_low',
  'humidity_mid',
  'humidity_high',
  'pan_tool',
  'pinch',
  'redo',
  'rotate_90_degrees_cw',
  'save',
  'screen_rotation_alt',
  'search',
  'search_off',
  'select_all',
  'settings',
  'share',
  'square_foot',
  'stylus',
  'text_fields',
  'transform',
  'trip_origin',
  'tune',
  'undo',
  'vertical_align_bottom',
  'view_list',
  'visibility',
  'visibility_off',
  'warning',
] as const

export type MaterialIconName = (typeof MATERIAL_ICON_NAMES)[number]

// Hand-drawn glyphs from src/assets/icons/*.svg, which no Material symbol
// covers ("carbon stick", "blending stump", and the two marker nib shapes).
// Listed rather than inferred from the glob because a type cannot be derived
// from a directory listing — Icon.tsx asserts in dev that the two agree, so
// dropping in an SVG and forgetting this line is caught on first render.
//
// A name may appear in both lists: a custom SVG deliberately overrides the
// Material symbol of the same name at every call site at once.
export const CUSTOM_ICON_NAMES = [
  'bullet-tip', 'charcoal', 'chisel-tip', 'distort', 'free-transform', 'freehand-lasso',
  'point-lasso', 'rectangle-lasso', 'skew-and-rotate', 'smudge',
] as const

export type CustomIconName = (typeof CUSTOM_ICON_NAMES)[number]

export type IconName = MaterialIconName | CustomIconName
