import Regexp from 'path-to-regexp'
import { cleanPath } from './util/path'
import { assert, warn } from './util/warn'

/**
 *
 * @param { Array<RouteConfig> } routes
 * @param { ?Array<string> } oldPathList
 * @param { ?Dictionary<RouteRecord> } oldPathMap
 * @param { ?Dictionary<RouteRecord> } oldNameMap
 * @param { ?RouteRecord } parentRoute
 * @returns {pathList: Array<string>, pathMap: Dictionary<RouteRecord>, nameMap: Dictionary<RouteRecord>}
 */
export function createRouteMap(
  routes,
  oldPathList,
  oldPathMap,
  oldNameMap,
  parentRoute
) {
  // 这个路径列表用来控制路径匹配优先级
  const pathList = oldPathList || []
  // $flow-disable-line
  const pathMap = oldPathMap || Object.create(null)
  // $flow-disable-line
  const nameMap = oldNameMap || Object.create(null)

  // 深度遍历
  routes.forEach((route) => {
    addRouteRecord(pathList, pathMap, nameMap, route, parentRoute)
  })

  // 把通配符*移动到最后
  // ensure wildcard routes are always at the end
  for (let i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0])
      l--
      i--
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // warn if routes do not include leading slashes
    const found = pathList
      // check for missing leading slash
      .filter(
        (path) => path && path.charAt(0) !== '*' && path.charAt(0) !== '/'
      )

    if (found.length > 0) {
      const pathNames = found.map((path) => `- ${path}`).join('\n')
      warn(
        false,
        `Non-nested routes must include a leading slash character. Fix the following routes: \n${pathNames}`
      )
    }
  }

  return {
    pathList,
    pathMap,
    nameMap,
  }
}

/**
 * 添加路由记录
 * @param { Array<string> } pathList
 * @param { Dictionary<RouteRecord> } pathMap
 * @param { Dictionary<RouteRecord> } nameMap
 * @param { RouteConfig } route
 * @param { RouteRecord } parent
 * @param { ?String } matchAs
 */
function addRouteRecord(pathList, pathMap, nameMap, route, parent, matchAs) {
  const { path, name } = route
  if (process.env.NODE_ENV !== 'production') {
    assert(path != null, `"path" is required in a route configuration.`)
    assert(
      typeof route.component !== 'string',
      `route config "component" for path: ${String(
        path || name
      )} cannot be a ` + `string id. Use an actual component instead.`
    )

    warn(
      // eslint-disable-next-line no-control-regex
      !/[^\u0000-\u007F]+/.test(path),
      `Route with path "${path}" contains unencoded characters, make sure ` +
        `your path is correctly encoded before passing it to the router. Use ` +
        `encodeURI to encode static segments of your path.`
    )
  }

  /**
   * @param { PathToRegexpOptions } pathToRegexpOptions
   */
  const pathToRegexpOptions = route.pathToRegexpOptions || {}
  // 格式化当前路由的完整路径
  const normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict)

  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive
  }

  /**
   * @param { RouteRecord }
   */
  const record = {
    // 完整路径
    path: normalizedPath,
    // 路径正则
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    // 组件
    components: route.components || { default: route.component },
    // 别名，标准是 String[]
    alias: route.alias
      ? typeof route.alias === 'string'
        ? [route.alias]
        : route.alias
      : [],
    instances: {},
    enteredCbs: {},
    name,
    parent,
    matchAs,
    redirect: route.redirect,
    beforeEnter: route.beforeEnter,
    meta: route.meta || {},
    props:
      route.props == null
        ? {}
        : route.components
        ? route.props
        : { default: route.props },
  }

  // 递归处理子路由
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    if (process.env.NODE_ENV !== 'production') {
      if (
        route.name &&
        !route.redirect &&
        route.children.some((child) => /^\/?$/.test(child.path))
      ) {
        warn(
          false,
          `Named Route '${route.name}' has a default child route. ` +
            `When navigating to this named route (:to="{name: '${route.name}'"), ` +
            `the default child route will not be rendered. Remove the name from ` +
            `this route and use the name of the default child route for named ` +
            `links instead.`
        )
      }
    }
    route.children.forEach((child) => {
      const childMatchAs = matchAs
        ? cleanPath(`${matchAs}/${child.path}`)
        : undefined
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs)
    })
  }

  // 完整路径作为 key
  if (!pathMap[record.path]) {
    pathList.push(record.path)
    pathMap[record.path] = record
  }

  // 如果有别名，别名也作为path注册进去
  if (route.alias !== undefined) {
    const aliases = Array.isArray(route.alias) ? route.alias : [route.alias]
    for (let i = 0; i < aliases.length; ++i) {
      const alias = aliases[i]
      if (process.env.NODE_ENV !== 'production' && alias === path) {
        warn(
          false,
          `Found an alias with the same value as the path: "${path}". You have to remove that alias. It will be ignored in development.`
        )
        // skip in dev to make it work
        continue
      }

      const aliasRoute = {
        path: alias,
        children: route.children,
      }
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      )
    }
  }

  // nameMap也维护一份RouteRecord
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record
    } else if (process.env.NODE_ENV !== 'production' && !matchAs) {
      warn(
        false,
        `Duplicate named routes definition: ` +
          `{ name: "${name}", path: "${record.path}" }`
      )
    }
  }
}

/**
 * @description 编译路由的正则
 * @param { String } path
 * @param { PathToRegexpOptions } pathToRegexpOptions
 * @returns { RouteRegExp }
 */
function compileRouteRegex(path, pathToRegexpOptions) {
  const regex = Regexp(path, [], pathToRegexpOptions)
  if (process.env.NODE_ENV !== 'production') {
    const keys = Object.create(null)
    regex.keys.forEach((key) => {
      warn(
        !keys[key.name],
        `Duplicate param keys in route with path: "${path}"`
      )
      keys[key.name] = true
    })
  }
  return regex
}

/**
 * 格式化路径
 * @param { String } path
 * @param { ?RouteRecord } parent
 * @param { ?Boolean } strict
 * @returns { String }
 */
function normalizePath(path, parent, strict) {
  // 非严格模式，清除掉末尾的 /
  if (!strict) path = path.replace(/\/$/, '')

  // path 以 / 开头，直接返回 path
  if (path[0] === '/') return path

  // 没有 parent， 直接返回 path
  if (parent == null) return path

  // 拼接完整路径，清除多余的斜杠
  return cleanPath(`${parent.path}/${path}`)
}
