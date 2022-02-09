/**
 * @description 执行队列
 * @param { Array<?NavigationGuard> } queue 
 * @param { Function } fn 
 * @param { Function } cb 
 */
export function runQueue(queue, fn, cb) {
  // 异步函数
  const step = index => {
    // 超出队列长度，直接执行最终的回调函数
    if (index >= queue.length) {
      cb()
    }
    // 在队列范围内
    else {
      // 如果当前有执行的任务，任务执行完成后执行下一步
      if (queue[index]) {
        fn(queue[index], () => {
          step(index + 1)
        })
      }
      // 否则直接执行下一步
      else {
        step(index + 1)
      }
    }
  }
  // 从0开始执行
  step(0)
}
