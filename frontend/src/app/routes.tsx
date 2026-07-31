import React, { Suspense } from 'react'
import { Switch, Redirect } from 'react-router-dom'
import { RoutePage } from './LoadPage'
import { LAB_PATTERN } from 'practice'

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
          <RoutePage exact path='/' page={import('./home/HomePage').then(m => ({ Page: m.HomePage }))} />
          <Redirect to='/' />
        </Switch>
      </RoutePage>
    </Switch>
  </Suspense>
}
