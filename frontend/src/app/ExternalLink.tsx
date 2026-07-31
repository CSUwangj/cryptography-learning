import React from 'react'

export const ExternalLink: React.FC<{link: string}> = ({link, children}) => (
  <a href={link} target='_blank' rel='noopener noreferrer'>{children}</a>
)
