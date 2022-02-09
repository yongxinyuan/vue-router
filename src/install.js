import View from './components/view'
import Link from './components/link'

export let _Vue

export function install(Vue) {
  // 已经安装，已缓存Vue
  if (install.installed && _Vue === Vue) return

  // 修改状态
  install.installed = true

  // 缓存Vue
  _Vue = Vue

  const isDef = (v) => v !== undefined

  const registerInstance = (vm, callVal) => {
    let i = vm.$options._parentVnode

    // vm.$options._parentVnode.data.registerRouteInstance
    if (
      isDef(i) &&
      isDef((i = i.data)) &&
      isDef((i = i.registerRouteInstance))
    ) {
      i(vm, callVal)
    }
  }

  // 混合 beforeCreate 和 destroyed
  Vue.mixin({
    beforeCreate() {
      // 创建Vue实例的参数配置中有 router
      if (isDef(this.$options.router)) {
        // vm._routerRoot = vm;
        this._routerRoot = this
        // vm._router = vm.$options.router
        this._router = this.$options.router
        // 执行 router.init
        this._router.init(this)
        // vm._route = router.history.current
        // 收集依赖，触发响应式通信
        Vue.util.defineReactive(this, '_route', this._router.history.current)
      } else {
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
      }
      registerInstance(this, this)
    },
    destroyed() {
      registerInstance(this)
    },
  })

  // this.$router
  Object.defineProperty(Vue.prototype, '$router', {
    get() {
      return this._routerRoot._router
    },
  })

  // this.$route
  Object.defineProperty(Vue.prototype, '$route', {
    get() {
      return this._routerRoot._route
    },
  })

  // component
  Vue.component('RouterView', View)
  Vue.component('RouterLink', Link)

  const strats = Vue.config.optionMergeStrategies
  // use the same hook merging strategy for route hooks
  strats.beforeRouteEnter =
    strats.beforeRouteLeave =
    strats.beforeRouteUpdate =
      strats.created
}
