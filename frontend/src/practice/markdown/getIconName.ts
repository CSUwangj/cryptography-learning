import { IconName, Intent, MaybeElement } from "@blueprintjs/core"
import { applicationIcons } from 'ui'

export const getIconName = (icon?: IconName | MaybeElement, intent?: Intent): IconName | MaybeElement => {
  // 1. no icon
  if (icon === null) {
    return undefined
  }
  // 2. defined iconName prop
  if (icon !== undefined) {
    return icon
  }
  // 3. default intent icon
  switch (intent) {
  case Intent.DANGER:
    return applicationIcons.state.error
  case Intent.PRIMARY:
    return applicationIcons.state.primary
  case Intent.WARNING:
    return applicationIcons.state.warning
  case Intent.SUCCESS:
    return applicationIcons.state.success
  default:
    return undefined
  }
}
