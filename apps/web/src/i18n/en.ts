import type { Message, PluralForms } from './types'

// English is the source of truth for the key set (#208): `TranslationKey` is
// derived from this object, and every other locale is typed as `Dictionary`,
// so a key added here fails `npm run typecheck` in ru.ts until it's
// translated — a missing translation is a build error, not a string that
// quietly ships in the wrong language.
//
// Keys are flat and namespaced by where they're used (`room.`, `layers.`,
// `lessons.`, …) rather than nested objects: a flat map keeps lookup, the
// derived key union, and the per-locale completeness check all trivial.
//
// Deliberately NOT in here: the dev-only surfaces (feature-flag list, grain
// variant selectors, the pencil-sound tuning panel, the debug overlays).
// Those are internal instruments that change constantly and are only ever
// read by whoever is developing the thing they measure.
export const en = {
  // ── shared vocabulary ──────────────────────────────────────────────────
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.create': 'Create',
  'common.rename': 'Rename',
  'common.delete': 'Delete',
  'common.retry': 'Retry',
  'common.loading': 'Loading…',
  'common.working': 'Working…',
  'common.moveTo': 'Move to...',
  'common.moreActions': 'More actions',
  'common.continue': 'Continue',
  'common.ok': 'OK',

  // ── dialogs (#310) ─────────────────────────────────────────────────────
  // Accessible names for a confirm/notice opened without a visible title —
  // a screen reader still has to announce what kind of dialog appeared.
  'dialog.confirmLabel': 'Confirm',
  'dialog.noticeLabel': 'Notice',

  // ── account navigation ─────────────────────────────────────────────────
  'nav.newLesson': 'New lesson',
  'nav.logIn': 'Log in',
  'nav.register': 'Register',
  'nav.myLessons': 'My Lessons',
  'nav.logOut': 'Log out',
  'nav.settings': 'Settings',

  // ── auth page ──────────────────────────────────────────────────────────
  'auth.logIn': 'Log in',
  'auth.register': 'Register',
  'auth.email': 'Email',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.name': 'Name (optional)',
  'auth.namePlaceholder': 'Your name',
  'auth.password': 'Password',
  'auth.passwordPlaceholderNew': 'At least 8 characters',
  'auth.passwordPlaceholder': 'Password',
  'auth.createAccount': 'Create account',
  'auth.error.emailRequired': 'Email is required',
  'auth.error.passwordRequired': 'Password is required',
  'auth.error.invalidEmail': 'Enter a valid email address',
  'auth.error.weakPassword': 'Password must be at least 8 characters',
  'auth.error.emailTaken': 'An account with this email already exists',
  'auth.error.invalidCredentials': 'Incorrect email or password',
  'auth.error.registerFailed': 'Registration failed — try again',
  'auth.error.loginFailed': 'Log in failed — try again',

  // ── app settings page ──────────────────────────────────────────────────
  'settingsPage.title': 'Settings',
  'settingsPage.language': 'Language',
  'settingsPage.languageHint': 'Detected from your browser at first visit. Saved in this browser only.',
  'settingsPage.deviceType': 'Interface',
  'settingsPage.deviceTablet': 'Tablet',
  'settingsPage.deviceDesktop': 'Computer',
  'settingsPage.deviceTypeHint': 'Tablet is laid out for a finger and a stylus, computer for a mouse, a keyboard and a graphics tablet. Detected from your device at first visit — each of your devices keeps its own.',

  // ── create room ────────────────────────────────────────────────────────
  'create.heading': 'Create a room',
  'create.roomName': 'Room name (optional)',
  'create.untitled': 'Untitled',
  'create.paperSection': 'Paper texture — fixed after creation',
  'create.paperColor': 'Paper color',
  'create.useDefaultColor': 'Use default',
  'create.chooseTexture': 'Choose texture — {character}',
  'create.textureModalTitle': 'Texture — {coarseness} grain',
  'create.canvasSize': 'Canvas size',
  'create.size.square': 'Square',
  'create.size.custom': 'Custom',
  'create.size.infinite': 'Infinite',
  'create.size.noFixedSize': 'No fixed size',
  'create.rotateToLandscape': 'Rotate to landscape',
  'create.rotateToPortrait': 'Rotate to portrait',
  'create.width': 'Width',
  'create.height': 'Height',
  'create.access': 'Access',
  'create.passwordProtected': 'Password protected',
  'create.openAccess': 'Open — anyone with the link can join',
  'create.roomPassword': 'Room password',
  'create.submit': 'Create room',
  'create.error.customSize': 'Custom size must be between 100 and 4096 pixels',

  // ── paper picker vocabulary ────────────────────────────────────────────
  // Two axes (how much tooth × what the fibre looks like) plus `flat`, the
  // end stop of the tooth axis. The `.grain` forms are the lowercase noun
  // phrase used mid-sentence in the texture modal's title, which Russian
  // can't build by lowercasing the standalone label the way English can.
  'paper.coarseness.coarse': 'Coarse',
  'paper.coarseness.coarse.desc': 'Strong tooth',
  'paper.coarseness.coarse.grain': 'coarse',
  'paper.coarseness.medium': 'Medium',
  'paper.coarseness.medium.desc': 'Moderate tooth',
  'paper.coarseness.medium.grain': 'medium',
  'paper.coarseness.fine': 'Fine',
  'paper.coarseness.fine.desc': 'Barely any tooth',
  'paper.coarseness.fine.grain': 'fine',
  'paper.coarseness.flat': 'Flat',
  'paper.coarseness.flat.desc': 'No tooth at all',
  'paper.character.fbm': 'Plain grain',
  'paper.character.fbm.desc': 'Even, uniform grain',
  'paper.character.capsules': 'Fibrous',
  'paper.character.capsules.desc': 'Visible cellulose fibres',
  'paper.character.streak': 'Streaked',
  'paper.character.streak.desc': 'Laid, horizontal grain',

  // ── my lessons ─────────────────────────────────────────────────────────
  'lessons.root': 'My Lessons',
  'lessons.searchPlaceholder': 'Search rooms…',
  'lessons.searchLabel': 'Search rooms',
  'lessons.newRoom': 'New room',
  'lessons.newFolder': 'New folder',
  'lessons.viewLabel': 'View',
  'lessons.viewGrid': 'Tiles',
  'lessons.viewList': 'List',
  'lessons.folderNamePlaceholder': 'Folder name',
  'lessons.breadcrumbLabel': 'Folder path',
  'lessons.searching': 'Searching…',
  'lessons.noMatches': 'No rooms match "{query}".',
  'lessons.empty': "You don't have any rooms yet.",
  'lessons.folderEmpty': 'This folder is empty.',
  'lessons.forkClone': 'Fork/Clone',
  'lessons.comingSoon': 'Coming soon',
  'lessons.leaveRoom': 'Leave room',
  'lessons.ownerYou': 'You',
  'lessons.ownerUnknown': 'Unknown owner',
  'lessons.confirmDelete': 'Delete permanently for everyone?',
  'lessons.confirmLeave': 'Leave this room? It stays for everyone else.',
  'lessons.yesDelete': 'Yes, delete',
  'lessons.yesLeave': 'Yes, leave',
  'lessons.moveRoomTitle': 'Move room to...',
  'lessons.moveFolderTitle': 'Move folder to...',
  'lessons.error.load': 'Could not load your rooms',
  'lessons.error.delete': 'Could not delete the room',
  'lessons.error.leave': 'Could not leave the room',
  'lessons.error.createFolder': 'Could not create the folder',
  'lessons.error.search': 'Search failed',
  'lessons.error.moveFolderCycle': "Can't move a folder into its own subfolder.",
  'lessons.error.moveFolder': 'Could not move the folder',
  'lessons.error.folderNotEmpty': 'This folder still has rooms or subfolders in it — move or delete those first.',
  'lessons.error.deleteFolder': 'Could not delete the folder',

  // ── "move to..." dialog ────────────────────────────────────────────────
  'moveTo.destinationLabel': 'Destination folder path',
  'moveTo.moveHere': 'Move here',
  'moveTo.noSubfolders': 'No subfolders here.',

  // ── join gate ──────────────────────────────────────────────────────────
  'join.headingNamed': 'Join "{room}"',
  'join.heading': 'Join room',
  'join.yourName': 'Your name',
  'join.namePlaceholder': 'e.g. Alex',
  'join.password': 'Password (if the room has one)',
  'join.passwordPlaceholder': 'Leave blank if none',
  'join.submit': 'Join room',
  'join.submitting': 'Joining…',
  'join.error.nameRequired': 'Name is required',
  'join.error.notFound': "This room doesn't exist. Check the link, or ask the host to create it.",
  'join.error.wrongPassword': 'Wrong password — try again.',

  // ── room: header & canvas actions ──────────────────────────────────────
  'room.home': 'Grafetto — leave this room',
  'room.confirmLeaveTitle': 'Leave this room?',
  'room.confirmLeaveMessage': 'The drawing stays in the room and you can open it again from My Lessons.',
  'room.confirmLeave': 'Leave',
  'room.confirmLeaveStay': 'Stay',
  'room.settings': 'Settings',
  'room.fullscreen': 'Fullscreen',
  'room.exitFullscreen': 'Exit fullscreen',
  'room.freeze': "Freeze room — pause everyone's drawing",
  'room.freezeShort': 'Freeze room',
  'room.unfreeze': 'Unfreeze room — let everyone draw again',
  'room.unfreezeShort': 'Unfreeze room',
  'room.zoom': 'Zoom — drag up/down to adjust, click to reset to 100%',
  'room.rotation': 'Rotation — drag up/down to turn the canvas, click for a quarter turn  ({hotkey} to reset)',
  'room.fitCanvas': 'Fit canvas',
  'room.undo': 'Undo',
  'room.undoTitle': 'Undo  {hotkey}',
  'room.redo': 'Redo',
  'room.redoTitle': 'Redo  {hotkey}',
  'room.export': 'Export',
  'room.exportTitle': 'Export PNG',
  'room.saveSession': 'Save',
  'room.saveSessionTitle': 'Save session as JSON',
  // (#329) The header's "≡" — export/save/settings, everything reached for
  // between strokes rather than during one.
  'room.menu': 'Menu',
  'room.confirmUndo': 'Undo will remove a layer that has content from other participants. Continue?',
  'room.confirmRedo': 'Redo will remove a layer that has content from other participants. Continue?',
  'room.offlineSharedAction': 'No connection to the room — this action affects shared layers and becomes available again once you reconnect.',

  // ── room: side panel ───────────────────────────────────────────────────
  'room.panel.layers': 'Layers',
  'room.panel.color': 'Color',
  'room.panel.toolSettings': 'Tool settings',
  'room.panel.participants': 'Participants',
  'room.noToolSettings': 'This tool has no settings yet.',
  'room.markerAngle': 'Marker angle',

  // ── room: participants & status banners ────────────────────────────────
  'room.participant.owner': 'owner',
  'room.participant.drawing': 'drawing',
  'room.participant.frozen': 'frozen by owner',
  'room.participant.freeze': 'Freeze {name}',
  'room.participant.unfreeze': 'Unfreeze {name}',
  // (#328) Participants panel. The freeze/unfreeze labels here are menu items
  // on an already-named row, so they don't repeat the name the way the old
  // hover-badge tooltips above had to.
  'room.participants.you': '(you)',
  'room.participants.idle': 'in the room',
  'room.participants.empty': 'Nobody else is here yet.',
  'room.participants.freeze': 'Freeze drawing',
  'room.participants.unfreeze': 'Unfreeze drawing',
  'room.participants.ban': 'Block',
  'room.participants.banUnavailable': 'Room access control is not built yet',
  'room.frozenEveryone': 'The room owner has paused drawing for everyone.',
  'room.frozenYou': 'The room owner has paused your drawing.',
  // (#201) The queue is durable, so these describe a delay, never a loss —
  // the wording has to carry that, since the whole point is to stop people
  // concluding their work is gone.
  // (#313) Shown instead of the preloader when the room can't load because
  // there's no connection. Three things, in order: why, that the work is
  // safe, and that nothing needs doing about it.
  'room.offline.title': 'No connection',
  'room.offline.body': 'This room lives on the server, so opening it needs a connection.',
  'room.offline.pending': {
    one: 'Your {n} unsent stroke is safe on this device and will be sent automatically.',
    other: 'Your {n} unsent strokes are safe on this device and will be sent automatically.',
  },
  'room.offline.retrying': 'Trying to reconnect…',
  'room.connection.offline': 'No connection — reconnecting…',
  'room.connection.offlineWithPending': {
    one: 'No connection. {n} stroke is saved on this device and will be sent once you reconnect.',
    other: 'No connection. {n} strokes are saved on this device and will be sent once you reconnect.',
  },
  'room.connection.syncing': {
    one: 'Saving {n} stroke…',
    other: 'Saving {n} strokes…',
  },
  'room.connection.stalled': {
    one: '{n} stroke could not be sent yet — it is kept on this device and will be retried.',
    other: '{n} strokes could not be sent yet — they are kept on this device and will be retried.',
  },
  'room.lostWork': 'Some of what you drew was not saved — the layer was deleted by another participant.',
  // (#312) The recoverable case: the strokes came back and are already on a
  // new layer by the time this shows.
  'room.lostWork.recoveredOne':
    'The “{name}” layer was deleted while you were drawing. Your strokes were restored onto a separate layer.',
  'room.lostWork.recoveredMany': {
    other: '{n} layers you were drawing on were deleted. Your strokes were restored onto separate layers.',
  },
  'room.lostWork.undo': 'Undo',
  'room.lostWork.restoredLayerName': '{name} (restored)',
  'room.lostWork.unnamedLayer': 'Deleted layer',
  'room.dismiss': 'Dismiss',

  // ── room: loading flavor text ──────────────────────────────────────────
  'room.loading.1': 'Sharpening pencil...',
  'room.loading.2': 'Gluing paper to canvas...',
  'room.loading.3': 'Arranging layers...',
  'room.loading.4': 'Mixing graphite...',
  'room.loading.5': 'Setting up easel...',
  'room.loading.6': 'Dusting off eraser...',
  'room.loading.7': 'Unrolling paper...',
  'room.loading.8': 'Sorting pencils by grade...',

  // ── tools ──────────────────────────────────────────────────────────────
  'tool.pencil': 'Pencil',
  'tool.pencilTitle': 'Pencil  ({hotkeys} for quick grade picks)',
  'tool.eraser': 'Eraser',
  'tool.eraserTitle': 'Eraser  {hotkey}',
  'tool.smudge': 'Smudge',
  'tool.smudgeTitle': 'Smudge — blend graphite already on the page  {hotkey}',
  'tool.charcoal': 'Charcoal',
  'tool.charcoalTitle': "Charcoal — loose carbon stick; grabs the paper's tooth, crumbles, sheds dust  {hotkey}",
  'tool.liner': 'Liner',
  'tool.linerTitle': 'Liner — ink pen, near-constant line width  {hotkey}',
  'tool.marker': 'Marker',
  'tool.markerTitle': 'Marker — two-nib (bullet/chisel) marker rendering  {hotkey}',
  'tool.eyedropper': 'Eyedropper — pick a color from the canvas',
  'tool.ruler': 'Ruler — drag a straight edge; pencil strokes drawn near it snap to its line and show the distance',
  'tool.transform': 'Transform — move/scale/rotate the active layer or current selection',
  'tool.grid': 'Toggle construction grid',

  // ── tool settings (TOOL_SCHEMAS field labels and enum options) ─────────
  'tool.field.grade': 'Grade',
  'tool.field.size': 'Size',
  'tool.field.opacity': 'Opacity',
  'tool.field.color': 'Color',
  'tool.field.type': 'Type',
  'tool.field.nib': 'Nib',
  'tool.field.angle': 'Angle',
  'tool.field.followStroke': 'Follow stroke direction',
  'tool.field.strength': 'Strength',
  'tool.field.addToPalette': 'Add to palette on pick',
  'tool.charcoalType.vine': 'Vine',
  'tool.charcoalType.willow': 'Willow',
  'tool.charcoalType.compressed': 'Compressed',
  'tool.nib.bullet': 'Bullet',
  'tool.nib.chisel': 'Chisel',

  // ── color palette ──────────────────────────────────────────────────────
  'palette.open': 'Palette',
  'palette.openLabel': 'Open palette',
  'palette.closeLabel': 'Close palette',
  'palette.openPicker': 'Open color picker',
  'palette.selectColor': 'Select color {color}',
  'palette.add': 'Add to palette',
  'palette.remove': 'Remove from palette',
  'palette.dragPanel': 'Drag to move',

  // ── side panel chrome ──────────────────────────────────────────────────
  'sidePanel.collapse': 'Collapse',
  'sidePanel.collapseTab': 'Collapse {title}',
  'sidePanel.openTab': 'Open {title}',

  // ── layers panel ───────────────────────────────────────────────────────
  'layers.opacity': 'Opacity',
  'layers.addLayer': 'Add layer',
  'layers.addFolder': 'Add folder',
  'layers.importImage': 'Import reference image',
  'layers.lockLayer': 'Lock layer',
  'layers.unlockLayer': 'Unlock layer',
  'layers.ownerLock': 'Lock layer for others (owner)',
  'layers.ownerUnlock': 'Unlock layer for others (owner)',
  'layers.ownerLockShort': 'Lock layer for others',
  'layers.ownerUnlockShort': 'Unlock layer for others',
  'layers.lockedByOwner': 'Locked by the room owner',
  'layers.mergeSelected': 'Merge selected',
  'layers.mergeDown': 'Merge down',
  'layers.deleteSelected': 'Delete selected',
  'layers.deleteLayer': 'Delete layer',
  // (#329) Was "Clear canvas" in the room header, which is not what it ever
  // did — it clears one layer, and now says which.
  'layers.clearLayer': 'Clear layer',
  'layers.confirmClear': 'Erase everything painted on "{name}"? Other participants\' work on this layer goes too. This can be undone.',
  'layers.touchHint': 'Tip: press and hold a layer to select multiple',
  'layers.dismissHint': 'Dismiss',
  'layers.confirmDelete': 'Delete the selected layer(s)? Any painted content on them — including content from other participants — will be lost.',
  'layers.importFailed': 'Could not import image',
  'layers.hide': 'Hide',
  'layers.show': 'Show',
  'layers.lock': 'Lock',
  'layers.unlock': 'Unlock',
  'layers.backgroundLocked': 'The background is always locked',
  'layers.expand': 'Expand',
  'layers.collapse': 'Collapse',
  'layers.more': 'More',
  // Layer names travel through the operation log to every participant, so
  // these are named in whatever language the person who created the layer
  // was using — same as a room name. Shared content, not local chrome.
  'layers.backgroundName': 'Background',
  'layers.defaultLayerName': 'Layer {n}',
  'layers.defaultFolderName': 'Folder',
  'layers.mergedName': 'Merged',
  'layers.referenceName': 'Reference',

  // ── editor settings panel (#174 hotkeys tab + panel chrome) ────────────
  'editorSettings.title': 'Settings',
  'editorSettings.tab.general': 'General',
  'editorSettings.tab.hotkeys': 'Hotkeys',
  'editorSettings.unsaved': 'Unsaved changes — reloads the page.',
  'editorSettings.applyAfterSave': 'Changes apply after Save.',
  'editorSettings.pressKey': 'Press a key…',
  'editorSettings.hotkeyConflict': 'Already used by "{action}"',
  'editorSettings.resetHotkeys': 'Reset hotkeys to defaults',

  'hotkey.undo': 'Undo',
  'hotkey.redo': 'Redo',
  'hotkey.toggleEraser': 'Toggle eraser / pencil',
  'hotkey.toggleSmudge': 'Toggle smudge / pencil',
  'hotkey.toggleCharcoal': 'Toggle charcoal / pencil',
  'hotkey.toggleLiner': 'Toggle liner / pencil',
  'hotkey.toggleMarker': 'Toggle marker / pencil',
  'hotkey.resetRotation': 'Reset rotation to 0°',
  'hotkey.decreaseSize': 'Decrease brush size',
  'hotkey.increaseSize': 'Increase brush size',
  'hotkey.rotateCCW': 'Rotate view −15°',
  'hotkey.rotateCW': 'Rotate view +15°',
  'hotkey.gradeH': 'Pencil grade: H (quick pick)',
  'hotkey.gradeHB': 'Pencil grade: HB (quick pick)',
  'hotkey.grade2B': 'Pencil grade: 2B (quick pick)',
  'hotkey.grade4B': 'Pencil grade: 4B (quick pick)',
  'hotkey.grade6B': 'Pencil grade: 6B (quick pick)',
} satisfies Record<string, Message>

export type TranslationKey = keyof typeof en

/** Every other locale's shape: exactly English's key set, and — per key —
 *  either a plain string or a plural-form set, matching whichever English
 *  used. TypeScript rejects a missing key, a stray key, and a plural entry
 *  written as a bare string, all at `npm run typecheck` time. */
export type Dictionary = {
  [K in TranslationKey]: (typeof en)[K] extends string ? string : PluralForms
}
