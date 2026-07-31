import React, { Suspense, useMemo, type PropsWithChildren } from 'react'
import { Loading, useError } from 'ui'
import { Route, RouteProps } from 'react-router-dom'

type PageComponent = React.ComponentType<PropsWithChildren>

type LoadPageProps = {
  page: Promise<{ Page: PageComponent }>
}

const Empty: PageComponent = () => <></>

export const LoadPage: React.FC<PropsWithChildren<{ lazy: React.LazyExoticComponent<PageComponent>}>> = ({ lazy, children }) => {
  const Lazy = lazy

  return <Suspense fallback={<Loading />}>
    <Lazy>{children}</Lazy>
  </Suspense>
}

const getKey = (path: RouteProps['path']): string | undefined => {
  if (path == null) {
    return undefined
  }
  if (typeof path === 'string') {
    return path
  }
  return Array.from(path).join(',')
}

const Cache = new Map<LoadPageProps['page'], React.LazyExoticComponent<PageComponent>>()

export const RoutePage: React.FC<PropsWithChildren<RouteProps & LoadPageProps>> = ({ page, children, ...rest}) => {
  const [ error, { setError } ] = useError()
  const defPage = useMemo(() => {
    let lazy = Cache.get(page)
    if(!lazy) {
      lazy = React.lazy(() => page
        .then(i => ({
          default: i.Page
        })).catch(e => {
          setError(e)
          return ({
            default: Empty
          })
        })
      )
    }
    return lazy
  }, [ page, setError ])
  return <Route {...rest}>{ error || <LoadPage key={getKey(rest.path)} lazy={defPage}>{children}</LoadPage>}</Route>
}
