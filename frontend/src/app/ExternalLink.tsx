import React, { type PropsWithChildren } from 'react'

export const ExternalLink: React.FC<PropsWithChildren<{link: string}>> = ({link, children}) => (
  <a href={link} target='_blank' rel='noopener noreferrer'>{children}</a>
)
