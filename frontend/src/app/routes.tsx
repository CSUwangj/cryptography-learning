import React, { Suspense } from 'react'
import { Switch } from 'react-router-dom'
import { RoutePage } from './LoadPage'
import { LAB_PATTERN } from 'practice'
import { COMPLETION_PATTERN } from 'completion_board'

export const Routes: React.FC = () => {
  return <Suspense fallback={ <div>faild</div> }>
    <Switch>
      <RoutePage path='/' page={import('./shell/Shell').then(m => ({ Page: m.Shell }))}>
        <Switch>
          <RoutePage exact path='/tutorial' page={import('./tutorial/TutorialPage').then(m => ({ Page: m.TutorialPage }))} />
          <RoutePage exact path={LAB_PATTERN} page={import('practice').then(m => ({ Page: m.PracticePage }))} />
          <RoutePage path='/practice' page={import('practice').then(m => ({ Page: m.PracticePage }))} />
          <RoutePage path='/learning' page={import('./learning/LearningPage').then(m => ({ Page: m.LearningPage }))} />
          <RoutePage path='/feedback' page={import('./feedback/FeedbackPage').then(m => ({ Page: m.FeedbackPage }))} />
          <RoutePage exact path={COMPLETION_PATTERN} page={import('completion_board').then(m => ({ Page: m.CompletionRecordsPage }))} />
          <RoutePage exact path='/' page={import('./home/HomePage').then(m => ({ Page: m.HomePage }))} />
          <RoutePage page={import('./NotFoundPage').then(m => ({ Page: m.NotFoundPage }))} />
        </Switch>
      </RoutePage>
    </Switch>
  </Suspense>
}
