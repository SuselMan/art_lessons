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
  'create_new_folder',
  'delete',
  'delete_forever',
  'download',
  'drag_indicator',
  'edit',
  'error',
  'expand_more',
  'fit_screen',
  'folder',
  'folder_open',
  'fullscreen',
  'fullscreen_exit',
  'gradient',
  'grid_on',
  'grid_view',
  'group',
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
  'pan_tool',
  'redo',
  'rotate_90_degrees_cw',
  'save',
  'screen_rotation_alt',
  'search',
  'search_off',
  'settings',
  'square_foot',
  'stylus',
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
export const CUSTOM_ICON_NAMES = ['bullet-tip', 'charcoal', 'chisel-tip', 'smudge'] as const

export type CustomIconName = (typeof CUSTOM_ICON_NAMES)[number]

export type IconName = MaterialIconName | CustomIconName
