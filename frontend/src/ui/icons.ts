import { IconNames } from '@blueprintjs/icons'

/** Application-owned meanings; authored content and teaching notation keep their own icons. */
export const applicationIcons = {
  navigation: {
    home: IconNames.HOME,
    learning: IconNames.LEARNING,
    practice: IconNames.FLAG,
    feedback: IconNames.ENVELOPE,
    language: IconNames.TRANSLATE,
  },
  action: {
    learningCatalog: IconNames.BOOK,
    completionRecords: IconNames.TH,
    download: IconNames.DOWNLOAD,
  },
  state: {
    lightTheme: IconNames.FLASH,
    darkTheme: IconNames.MOON,
    error: IconNames.ERROR,
    danger: IconNames.BAN_CIRCLE,
    primary: IconNames.INFO_SIGN,
    warning: IconNames.WARNING_SIGN,
    success: IconNames.TICK,
    workInProgress: IconNames.OUTDATED,
  },
  status: {
    recorded: '✓',
    notRecorded: '—',
  },
  control: {
    expanded: IconNames.CARET_DOWN,
    collapsed: IconNames.CARET_RIGHT,
  },
} as const
