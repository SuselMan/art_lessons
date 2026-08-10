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
  // (#48) The service worker found a newer deploy. Deliberately an offer and
  // not an automatic reload: a teacher mid-lesson can have unsent operations
  // in the queue (#313 guards the same thing with beforeunload), and losing
  // them to a background refresh would be the app breaking its own promise.
  'update.available': 'A new version is available',
  'update.reload': 'Update',
  // (#343) Was `room.dismiss` — moved into the shared vocabulary when the
  // notification strip became one component used on every page, not just in
  // the room.
  'common.dismiss': 'Dismiss',
  'common.loading': 'Loading…',
  'common.working': 'Working…',
  'common.moveTo': 'Move to...',
  'common.moreActions': 'More actions',
  'common.continue': 'Continue',
  'common.ok': 'OK',
  'common.done': 'Done',

  // ── dialogs (#310) ─────────────────────────────────────────────────────
  // Accessible names for a confirm/notice opened without a visible title —
  // a screen reader still has to announce what kind of dialog appeared.
  'dialog.confirmLabel': 'Confirm',
  'dialog.noticeLabel': 'Notice',

  // ── account navigation ─────────────────────────────────────────────────
  'nav.logIn': 'Log in',
  'nav.myLessons': 'My Projects',
  'nav.logOut': 'Log out',
  'nav.settings': 'Settings',

  // ── auth page (#316: one-time code, no password) ───────────────────────
  'auth.title': 'Sign in',
  'auth.subtitle': "Enter your email and we'll send a one-time code. No password to remember.",
  'auth.email': 'Email',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendCode': 'Send code',
  'auth.codeSent': 'We sent a code to {email}',
  // (#353) The length hint lives in the label, not in a placeholder: the
  // placeholder had to be smaller than the field's own display-size digits,
  // and a smaller glyph on the same baseline sits visibly below the box's
  // optical centre. One place to read, nothing to misalign.
  'auth.code': 'Code from the email — 6 digits',
  'auth.confirmation': 'The email shows {phrase}',
  'auth.confirmationHint': "If it shows something else, that email isn't for this page — don't enter it.",
  'auth.signIn': 'Sign in',
  'auth.resend': 'Send a new code',
  'auth.resendIn': 'You can ask for a new code in {seconds} s',
  'auth.changeEmail': 'Use a different address',
  'auth.error.emailRequired': 'Email is required',
  'auth.error.codeRequired': 'Enter the code from the email',
  'auth.error.invalidEmail': 'Enter a valid email address',
  'auth.error.invalidCode': 'Wrong code — check the email and try again',
  'auth.error.codeExpired': 'That code has expired — ask for a new one',
  'auth.error.attemptsExhausted': 'Too many wrong tries — ask for a new code',
  'auth.error.wrongBrowser': 'This code was requested in a different browser — ask for a new one here',
  'auth.error.rateLimited': 'Too many attempts — wait a few minutes and try again',
  'auth.error.codeCooldown': 'A code was just sent — wait {seconds} s before asking again',
  'auth.error.emailFailed': "We couldn't send the email — try again in a minute",
  'auth.error.requestFailed': 'Could not send the code — try again',
  'auth.error.verifyFailed': 'Could not sign in — try again',

  // ── app settings page ──────────────────────────────────────────────────
  'settingsPage.title': 'Settings',
  'settingsPage.language': 'Language',
  'settingsPage.languageHint': 'Detected from your browser at first visit. Saved in this browser only.',
  'settingsPage.deviceType': 'Interface',
  'settingsPage.deviceTablet': 'Tablet',
  'settingsPage.deviceDesktop': 'Computer',
  'settingsPage.deviceTypeHint': 'Tablet is laid out for a finger and a stylus, computer for a mouse, a keyboard and a graphics tablet. Detected from your device at first visit — each of your devices keeps its own.',

  // ── create project ─────────────────────────────────────────────────────
  'create.heading': 'New project',
  'create.roomName': 'Project name (optional)',
  'create.untitled': 'Untitled',
  'create.paperSection': 'Paper texture — fixed after creation',
  'create.paperColor': 'Paper color',
  'create.useDefaultColor': 'Use default',
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
  // (#232) A password is its own gate, applying in either access mode — see
  // the accessMode comment in schema.prisma for why the two are separate.
  'create.requirePassword': 'Also ask for a password',
  'create.invitesPlaceholder': 'One email address per line',
  'create.invitesHint':
    'Invitations work once the person signs in with that address. You can add or remove people later under Access.',
  'create.roomPassword': 'Project password',
  'create.submit': 'Create project',
  // (#351) The room is created locally and instantly; what this waits on is
  // the editor's own code chunk loading. "Opening" describes what the person
  // is waiting for, which "Creating…" would not.
  'create.submitting': 'Opening…',
  'create.error.customSize': 'Custom size must be between 100 and 4096 pixels',
  'create.error.invalidInvite': "“{email}” doesn't look like an email address",

  // ── paper picker vocabulary ────────────────────────────────────────────
  // Two axes (how much tooth × what the fibre looks like) plus `flat`, the
  // end stop of the tooth axis. The `.grain` forms are the lowercase noun
  // phrase used mid-sentence in the texture modal's title, which Russian
  // can't build by lowercasing the standalone label the way English can.
  'paper.coarseness.coarse': 'Coarse',
  'paper.coarseness.coarse.desc': 'Strong tooth',
  'paper.coarseness.medium': 'Medium',
  'paper.coarseness.medium.desc': 'Moderate tooth',
  'paper.coarseness.fine': 'Fine',
  'paper.coarseness.fine.desc': 'Barely any tooth',
  'paper.coarseness.flat': 'Flat',
  'paper.coarseness.flat.desc': 'No tooth at all',
  // (#346) The card can't show this paper. Worth saying rather than showing a
  // plausible-looking swatch: a flat fill is what `flat` really looks like,
  // and the texture is the one choice a project can never change later.
  'paper.previewUnavailable': "Preview didn't load",

  // ── my projects ────────────────────────────────────────────────────────
  'lessons.root': 'My Projects',
  'lessons.searchPlaceholder': 'Search projects…',
  'lessons.searchLabel': 'Search projects',
  'lessons.newRoom': 'New project',
  'lessons.newFolder': 'New folder',
  'lessons.viewLabel': 'View',
  'lessons.viewGrid': 'Tiles',
  'lessons.viewList': 'List',
  'lessons.folderNamePlaceholder': 'Folder name',
  'lessons.breadcrumbLabel': 'Folder path',
  'lessons.searching': 'Searching…',
  'lessons.noMatches': 'No projects match "{query}".',
  'lessons.empty': "You don't have any projects yet.",
  'lessons.folderEmpty': 'This folder is empty.',
  'lessons.fork': 'Make a copy',
  // The copy lands next to the original, so it needs a name that tells the
  // two apart at a glance in a list of twenty (#317).
  'lessons.forkedName': '{name} — copy',
  // (#222) Closed for editing — how a lesson rests once it has been handed
  // out as homework, and what keeps a template from drifting.
  'lessons.close': 'Close for editing',
  'lessons.reopen': 'Reopen for editing',
  'lessons.closedBadge': 'Closed',
  'lessons.leaveRoom': 'Leave project',

  // (#228, release track §6) Access control — who may enter one project. The
  // same strings serve the panel wherever it is mounted: the lesson list's ⋮
  // (#229) and the project's own settings (#230).
  'access.title': 'Access',
  'access.modeHeading': 'Who can join',
  'access.mode.anyoneWithLink': 'Anyone with the link',
  'access.mode.anyoneWithLinkHint': 'The link is the key — anyone who has it can open this project.',
  'access.mode.inviteOnly': 'Only people you invite',
  'access.mode.inviteOnlyHint':
    'Only invited addresses get in. Anyone else can ask, and waits for you to let them in.',
  'access.passwordHeading': 'Password',
  // Said explicitly because it is the one setting people expect to replace
  // the mode rather than sit beside it.
  'access.passwordSet': 'A password is set — asked in either mode.',
  'access.passwordPlaceholder': 'Set a password (optional)',
  'access.passwordSave': 'Set',
  'access.passwordRemove': 'Remove',
  'access.invitesHeading': 'Invited',
  'access.invitesEmpty': 'Nobody is invited yet.',
  'access.invitesInactiveHint':
    'The project is open to anyone with the link, so this list changes nothing until you switch above.',
  'access.invitePlaceholder': 'Email address',
  'access.inviteAdd': 'Invite',
  'access.inviteRemove': 'Remove from the list',
  'access.requestsHeading': 'Waiting',
  'access.requestsEmpty': 'Nobody is waiting.',
  'access.approve': 'Let in',
  'access.deny': 'Not now',
  'access.participantsHeading': 'Been in this project',
  'access.participantsEmpty': 'Nobody has opened this project yet.',
  'access.unnamedParticipant': 'Unnamed',
  'access.you': 'You',
  'access.revoke': 'Revoke access',
  // The second click of the in-row confirmation — deliberately says what
  // happens rather than "yes", since it sits where the first button was.
  'access.revokeConfirm': 'Remove from the project',
  'access.revoked': 'Access revoked',
  'access.restore': 'Restore access',
  'access.error.load': 'Could not load the access settings',
  'access.error.mode': 'Could not change who can join',
  'access.error.password': 'Could not change the password',
  'access.error.invite': 'Could not send the invite',
  'access.error.inviteInvalid': "That doesn't look like an email address",
  'access.error.uninvite': 'Could not remove the invite',
  'access.error.request': 'Could not answer the request',
  'access.error.block': 'Could not change access for that person',
  'lessons.ownerYou': 'You',
  'lessons.ownerUnknown': 'Unknown owner',
  'lessons.confirmDelete': 'Delete permanently for everyone?',
  'lessons.confirmLeave': 'Leave this project? It stays for everyone else.',
  'lessons.yesDelete': 'Yes, delete',
  'lessons.yesLeave': 'Yes, leave',
  'lessons.moveRoomTitle': 'Move project to...',
  'lessons.moveFolderTitle': 'Move folder to...',
  'lessons.error.load': 'Could not load your projects',
  'lessons.error.delete': 'Could not delete the project',
  'lessons.error.fork': 'Could not copy the project',
  'lessons.error.close': 'Could not change who can edit this project',
  'lessons.error.leave': 'Could not leave the project',
  'lessons.error.createFolder': 'Could not create the folder',
  'lessons.error.search': 'Search failed',
  'lessons.error.moveFolderCycle': "Can't move a folder into its own subfolder.",
  'lessons.error.moveFolder': 'Could not move the folder',
  // (#343) These three had no message at all: their mutations carried no
  // `onError`, so a failed rename or move reverted the card silently and
  // looked like the click had simply not registered.
  'lessons.error.renameRoom': 'Could not rename the project',
  'lessons.error.renameFolder': 'Could not rename the folder',
  'lessons.error.moveRoom': 'Could not move the project',
  'lessons.error.folderNotEmpty': 'This folder still has projects or subfolders in it — move or delete those first.',
  'lessons.error.deleteFolder': 'Could not delete the folder',

  // ── "move to..." dialog ────────────────────────────────────────────────
  'moveTo.destinationLabel': 'Destination folder path',
  'moveTo.moveHere': 'Move here',
  'moveTo.alreadyHere': 'Already in this folder',
  'moveTo.noSubfolders': 'No subfolders here.',

  // ── join gate ──────────────────────────────────────────────────────────
  'join.headingNamed': 'Join "{room}"',
  'join.heading': 'Join project',
  'join.yourName': 'Your name',
  'join.namePlaceholder': 'e.g. Alex',
  'join.password': 'Password (if the project has one)',
  'join.passwordPlaceholder': 'Leave blank if none',
  'join.submit': 'Join project',
  'join.submitting': 'Joining…',
  // (#231) The screens that replace the form when the answer is about the
  // person rather than about what they typed.
  'join.signIn': 'Sign in',
  'join.tryAgain': "I've signed in — try again",
  'join.waiting': 'Waiting for an answer…',
  'join.denied': 'The host has not let you in this time. You can ask again.',
  'join.askAgain': 'Ask again',
  'join.error.nameRequired': 'Name is required',
  'join.error.notFound': "This project doesn't exist. Check the link, or ask the host to create it.",
  'join.error.wrongPassword': 'Wrong password — try again.',
  'join.error.accessRevoked': 'The host has removed your access to this project.',
  'join.error.loginRequired': 'This project is invite-only. Sign in with the address you were invited by.',
  'join.error.pendingApproval': 'Your request to join has been sent to the host. This page will let you in once they approve it.',
  'join.error.serverBusy': 'The server is at capacity right now. Wait a moment and try again — nothing of yours is lost.',

  // ── project: header & canvas actions ───────────────────────────────────
  'room.home': 'Grafetto — leave this project',
  'room.confirmLeaveTitle': 'Leave this project?',
  'room.confirmLeaveMessage': 'The drawing stays in the project and you can open it again from My Projects.',
  'room.confirmLeave': 'Leave',
  'room.confirmLeaveStay': 'Stay',
  // (#216) The header name doubles as its own rename field for the owner.
  'room.rename': 'Rename this project',
  'room.settings': 'Settings',
  'room.minimalUi': 'Minimal UI',
  'room.fullscreen': 'Fullscreen',
  'room.exitFullscreen': 'Exit fullscreen',
  'room.freeze': "Freeze project — pause everyone's drawing",
  'room.freezeShort': 'Freeze project',
  'room.unfreeze': 'Unfreeze project — let everyone draw again',
  'room.unfreezeShort': 'Unfreeze project',
  'room.zoom': 'Zoom — drag up/down to adjust, click to reset to 100%',
  'room.rotation': 'Rotation — drag up/down to turn the canvas, click for a quarter turn  ({hotkey} to reset)',
  'room.fitCanvas': 'Fit canvas',
  // (#362) The button on minimal UI's zoom/rotation strip. Says "view" rather
  // than naming both values: it sits next to them, and "Reset zoom and
  // rotation" would be wider than the two numbers it follows.
  'room.viewportReset': 'Reset view',
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
  // Same exit as the wordmark, spelled out — the logo is only recognisable as
  // a way out once you've tried it.
  'room.leave': 'Leave project',
  'room.confirmUndo': 'Undo will remove a layer that has content from other participants. Continue?',
  'room.confirmRedo': 'Redo will remove a layer that has content from other participants. Continue?',
  'room.offlineSharedAction': 'No connection to the project — this action affects shared layers and becomes available again once you reconnect.',

  // ── project: side panel ────────────────────────────────────────────────
  'room.panel.layers': 'Layers',
  'room.panel.color': 'Color',
  'room.panel.toolSettings': 'Tool settings',
  'room.panel.participants': 'Participants',
  'room.noToolSettings': 'This tool has no settings yet.',
  'room.markerAngle': 'Marker angle',

  // ── project: participants & status banners ─────────────────────────────
  'room.participant.owner': 'owner',
  'room.participant.drawing': 'drawing',
  'room.participant.frozen': 'frozen by owner',
  'room.participant.freeze': 'Freeze {name}',
  'room.participant.unfreeze': 'Unfreeze {name}',
  // (#328) Participants panel. The freeze/unfreeze labels here are menu items
  // on an already-named row, so they don't repeat the name the way the old
  // hover-badge tooltips above had to.
  'room.participants.you': '(you)',
  'room.participants.idle': 'in the project',
  'room.participants.empty': 'Nobody else is here yet.',
  'room.participants.freeze': 'Freeze drawing',
  'room.participants.unfreeze': 'Unfreeze drawing',
  'room.participants.ban': 'Block',
  'room.participants.banUnavailable': 'Project access control is not built yet',
  // (#380) The waiting queue, surfaced in the participants tab so the owner
  // finds out mid-lesson. The row's own buttons reuse `access.approve` /
  // `access.deny` on purpose — same decision, same two words, wherever it is
  // made from.
  'room.joinQueue.heading': 'Waiting to join',
  'room.joinQueue.badge': {
    one: '{n} person is waiting to join',
    other: '{n} people are waiting to join',
  },
  'room.frozenEveryone': 'The project owner has paused drawing for everyone.',
  'room.frozenYou': 'The project owner has paused your drawing.',
  // (#222) Two readers, two different next steps — the owner wants back in,
  // everyone else wants a copy of their own to work in.
  'room.closedOwner': 'This project is closed for editing — including for you.',
  'room.closedMember': 'This project is closed for editing.',
  // (#227/#231) Removed from the project while in it. Stays up until
  // dismissed: the next thing this person tries to draw will not be saved,
  // and a notice that faded after four seconds would leave them working into
  // a room that no longer accepts it.
  'room.kicked': 'The host has removed your access to this project. Nothing you draw from now on will be saved.',
  // (#385) Shown when the join-time replay could not apply every operation —
  // the canvas shows less than the project actually contains. Says "on this
  // device" because that is the honest scope: the project itself is intact on
  // the server, and this client deliberately will not write its own partial
  // canvas back over it.
  'room.replayIncomplete': 'Some of this project could not be drawn on this device, so what you see is incomplete. Nothing has been lost — reopening the project usually fixes it. Until then, this device will not save previews or restore points for it.',
  // (#232) Said out loud rather than logged: the project is already
  // invite-only, so an invite that didn't land is a student who will be stuck
  // asking to be let in. Fixable in the access panel.
  'room.invitesFailed': "{count} invitation(s) couldn't be sent. Add them again under Access.",
  'room.reopen': 'Reopen',
  'room.takeCopy': 'Take a copy',
  'room.error.rename': 'Could not rename the project',
  'room.error.reopen': 'Could not reopen the project',
  'room.error.takeCopy': 'Could not make your copy',
  // (#201) The queue is durable, so these describe a delay, never a loss —
  // the wording has to carry that, since the whole point is to stop people
  // concluding their work is gone.
  // (#313) Shown instead of the preloader when the project can't load because
  // there's no connection. Three things, in order: why, that the work is
  // safe, and that nothing needs doing about it.
  'room.offline.title': 'No connection',
  'room.offline.body': 'This project lives on the server, so opening it needs a connection.',
  'room.offline.pending': {
    one: 'Your {n} unsent stroke is safe on this device and will be sent automatically.',
    other: 'Your {n} unsent strokes are safe on this device and will be sent automatically.',
  },
  'room.offline.retrying': 'Trying to reconnect…',

  // (#346) The paper texture failed to load. Deliberately says what it means
  // for the person rather than what failed technically: without the texture
  // the engine refuses every stroke, so the honest headline is that the room
  // cannot be drawn in — and the honest reassurance is that nothing of theirs
  // is at stake, since this happens before anything of theirs is on screen.
  'room.paperFailed.title': "The paper didn't load",
  'room.paperFailed.body': 'Drawing needs the paper texture, so the project stays closed until it loads. Nothing has been lost — the drawing is on the server.',
  'room.paperFailed.retry': 'Try again',
  'room.paperFailed.retrying': 'Loading…',
  'room.connection.offline': 'No connection — reconnecting…',
  'room.connection.offlineWithPending': {
    one: 'No connection. {n} stroke is saved on this device and will be sent once you reconnect.',
    other: 'No connection. {n} strokes are saved on this device and will be sent once you reconnect.',
  },
  // (#376) The header's permanent save indicator, which took over the case
  // the connection banner used to cover with "Saving N strokes…" — see
  // SyncIndicator.tsx for why that stopped being a message and became a state.
  'room.sync.saved': 'Saved',
  'room.sync.syncing': 'Syncing…',
  // Says only that nothing can be sent right now. The reassurance that it is
  // kept and will go out later is ConnectionBanner's line, and repeating it
  // here in two words would be a promise too short to be believed.
  'room.sync.offline': 'No connection',
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

  // ── project: loading flavor text ───────────────────────────────────────
  'room.loading.1': 'Sharpening pencil...',
  'room.loading.2': 'Gluing paper to canvas...',
  'room.loading.3': 'Arranging layers...',
  'room.loading.4': 'Mixing graphite...',
  'room.loading.5': 'Setting up easel...',
  'room.loading.6': 'Dusting off eraser...',
  'room.loading.7': 'Unrolling paper...',
  'room.loading.8': 'Sorting pencils by grade...',
  // (#345) Shown instead of the rotating flavour text while the paper texture
  // is actually downloading — the one part of the room load with a real
  // percentage. Names the paper rather than saying "Loading" so the megabyte
  // count underneath reads as explaining itself.
  'room.loading.paper': 'Unrolling the paper...',

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
  'tool.hand': 'Hand',
  'tool.handTitle': 'Hand — drag to move the canvas, hold Shift to rotate it. Hold Space for the same without leaving your tool  {hotkey}',
  'tool.eyedropper': 'Eyedropper',
  'tool.eyedropperTitle': 'Eyedropper — pick a color from the canvas and go back to your tool  {hotkey}',
  'tool.ruler': 'Ruler',
  'tool.rulerTitle': 'Ruler — drag a straight edge; strokes drawn near it snap to its line and show the distance  {hotkey}',
  'tool.transform': 'Transform',
  'tool.transformTitle': 'Transform — move/scale/rotate/skew the active layer or current selection. Enter applies, Esc cancels  {hotkey}',
  'tool.grid': 'Grid',
  'tool.gridTitle': 'Construction grid  {hotkey}',

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
  'tool.field.mode': 'Mode',
  'tool.field.keepProportions': 'Keep proportions',
  'tool.field.showRuler': 'Show ruler',
  'tool.field.rulerSnap': 'Snap strokes to the ruler',
  'tool.field.showGrid': 'Show grid',
  'tool.field.tiltResponse': 'Tilt response',
  // The three curve shapes (#409). Named for how the tool answers the stylus,
  // not for their history — "the one from before" means nothing to anyone who
  // wasn't here, and the graph beside each name is what actually distinguishes
  // them.
  'tool.tiltResponse.restrained': 'Restrained',
  'tool.tiltResponse.smooth': 'Smooth',
  'tool.tiltResponse.linear': 'Linear',
  'tool.charcoalType.vine': 'Vine',
  'tool.charcoalType.willow': 'Willow',
  'tool.charcoalType.compressed': 'Compressed',
  'tool.nib.bullet': 'Bullet',
  'tool.nib.chisel': 'Chisel',
  'tool.transformMode.free': 'Free transform',
  'tool.transformMode.rotateSkew': 'Rotate & Skew',
  'tool.transformMode.distort': 'Distort',

  // ── color palette ──────────────────────────────────────────────────────
  'palette.open': 'Palette',
  'palette.openLabel': 'Open palette',
  'palette.closeLabel': 'Close palette',
  'palette.openPicker': 'Open color picker',
  'palette.selectColor': 'Select color {color}',
  'palette.add': 'Add to palette',
  'palette.remove': 'Remove from palette',
  'palette.dragPanel': 'Drag to move',
  'palette.mode': 'Picker shape',
  'palette.mode.bar': 'Hue strip',
  'palette.mode.ring': 'Hue ring',
  'palette.mode.triangle': 'Hue triangle',

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
  'layers.lockedByOwner': 'Locked by the project owner',
  'layers.mergeSelected': 'Merge selected',
  'layers.mergeDown': 'Merge down',
  'layers.deleteSelected': 'Delete selected',
  'layers.deleteLayer': 'Delete layer',
  // (#329) Was "Clear canvas" in the room header, which is not what it ever
  // did — it clears one layer, and now says which.
  'layers.clearLayer': 'Clear layer',
  'layers.confirmClear': 'Erase everything painted on "{name}"? Other participants\' work on this layer goes too. This can be undone.',
  'layers.selectMultiple': 'Select multiple layers',
  'layers.selectAll': 'Select all',
  'layers.deselectAll': 'Deselect all',
  'layers.selectedCount': '{n} selected',
  'layers.selectRow': 'Select this layer',
  'layers.deselectRow': 'Deselect this layer',
  'layers.dragHandle': 'Drag to reorder',
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
  // was using — same as a project name. Shared content, not local chrome.
  'layers.backgroundName': 'Background',
  'layers.defaultLayerName': 'Layer {n}',
  'layers.defaultFolderName': 'Folder',
  'layers.mergedName': 'Merged',
  'layers.referenceName': 'Reference',

  // ── editor settings panel (#174 hotkeys tab, #321 general/access tabs) ──
  'editorSettings.title': 'Settings',
  'editorSettings.tab.general': 'General',
  'editorSettings.tab.access': 'Access',
  'editorSettings.tab.hotkeys': 'Hotkeys',
  'editorSettings.tab.debug': 'Debug',
  'editorSettings.unsaved': 'Unsaved changes — reloads the page.',
  'editorSettings.applyAfterSave': 'Changes apply after Save.',
  'editorSettings.pressKey': 'Press a key…',
  'editorSettings.hotkeyConflict': 'Already used by "{action}"',
  'editorSettings.resetHotkeys': 'Reset hotkeys to defaults',

  'editorSettings.soundSection': 'Sound',
  'editorSettings.soundEnabled': 'Sound',
  'editorSettings.soundEnabledHint': 'Graphite on paper while you draw, and the interface\'s own clicks.',
  'editorSettings.soundVolume': 'Volume',
  'editorSettings.interfaceSection': 'Interface',
  'editorSettings.minimalUi': 'Minimal UI',
  'editorSettings.minimalUiHint': 'A short tap on the canvas hides the panels so only the drawing is left; tap again to bring them back. A stylus stroke never triggers it.',
  'editorSettings.floatingPanel': 'Floating panel',
  'editorSettings.floatingPanelHint': 'A movable cluster with undo/redo, the current tool and the eraser.',
  'editorSettings.floatingPanel.always': 'Always',
  'editorSettings.floatingPanel.minimal': 'In minimal UI',
  'editorSettings.floatingPanel.never': 'Never',
  'editorSettings.lockBrushAngle': 'Lock brush angle to the canvas',
  'editorSettings.lockBrushAngleHint': 'On: the marker\'s nib angle turns with the canvas as you rotate it. Off: it stays visually fixed on screen.',

  'hotkey.undo': 'Undo',
  'hotkey.redo': 'Redo',
  'hotkey.toggleEraser': 'Toggle eraser / pencil',
  'hotkey.toggleSmudge': 'Toggle smudge / pencil',
  'hotkey.toggleCharcoal': 'Toggle charcoal / pencil',
  'hotkey.toggleLiner': 'Toggle liner / pencil',
  'hotkey.toggleMarker': 'Toggle marker / pencil',
  'hotkey.toggleEyedropper': 'Toggle eyedropper',
  'hotkey.toggleRuler': 'Toggle ruler',
  'hotkey.toggleTransform': 'Toggle transform',
  'hotkey.toggleGrid': 'Toggle grid tool',
  'hotkey.resetRotation': 'Reset rotation to 0°',
  'hotkey.toggleHand': 'Toggle hand tool',
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
