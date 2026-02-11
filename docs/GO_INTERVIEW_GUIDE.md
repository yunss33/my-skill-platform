# Go 语言面试资料（速查 + 题库 + 代码要点）

> 目标：用最短时间覆盖“必问点”，并能写出不出错的并发与工程代码。

## 1. 面试当天 30 分钟复习路线

1) 基础：`make/new`、零值、数组/切片/映射、字符串/byte/rune、指针与值语义  
2) 接口：接口实现、`nil` 接口陷阱、组合（embedding）、方法集  
3) 并发：goroutine、channel、`select`、关闭语义、竞态与锁、`context` 取消  
4) 工程化：module、测试/benchmark、pprof、常见坑（for 捕获、defer、map 并发）  

---

## 2. 高频必问点（带结论）

### 2.1 `make` vs `new`

- `new(T)`：分配 **T 的零值**，返回 `*T`；不初始化内部结构。
- `make(T, ...)`：只用于 `slice/map/chan`，返回 **可用的** T（不是指针），完成内部初始化。

### 2.2 数组 vs 切片

- 数组：`[N]T`，长度是类型一部分；值传递会拷贝整个数组。
- 切片：`[]T`，三元组（ptr,len,cap）；`append` 可能扩容并返回新切片。

常问：函数内 `append` 为什么外面看不到？
- 扩容后底层数组换了；必须接收返回值：`s = append(s, x)`。

### 2.3 map

- 迭代顺序 **不保证**。
- map **非并发安全**：并发读写会 panic；并发读通常没事但不该依赖。
- 并发：`sync.Map` 或 `RWMutex`。

### 2.4 string / rune / byte

- `string` 是只读字节序列。
- `byte` = `uint8`；`rune` = `int32`（Unicode code point）。
- `len(s)` 是字节长度；字符数用 `utf8.RuneCountInString` 或 `for range`。

### 2.5 defer

- 返回前执行（LIFO）。
- `defer f(x)`：`x` 在 **defer 处求值**；闭包捕获变量是“同一个变量”。

### 2.6 panic / recover

- `panic` 展开栈并执行 defer；未 recover 则崩。
- `recover` 仅在 **defer** 中生效，常用于边界防护（HTTP middleware / goroutine entry）。

### 2.7 interface 的 nil 陷阱（超高频）

接口值 = (动态类型, 动态值)。只有两者都为 nil，接口才等于 nil。

```go
var p *MyErr = nil
var e error = p      // e != nil
```

### 2.8 方法集（method set）

- `T`：只有接收者 `(T)` 的方法
- `*T`：包含 `(T)` 与 `(*T)` 的方法
- 赋值给接口是否满足取决于方法集。

---

## 3. 并发必会（最常踩坑）

### 3.1 goroutine 泄漏

典型原因：channel 永远阻塞、没取消信号、worker 无退出条件。  
解决：`context` + `select`，所有阻塞点都能退出。

### 3.2 channel 关闭语义

- 关闭者通常是“发送方/拥有者”，不要让多个发送方都 close。
- 从关闭 channel 读取：零值 + `ok=false`。
- 向关闭 channel 发送：panic。
- `for range ch`：直到关闭并读空结束。

### 3.3 select

- 无 case 可运行会阻塞；加 `default` 会忙等（慎用）。
- 高频 `time.After` 可能导致定时器堆积；可复用 `time.NewTimer`。

### 3.4 同步原语怎么选

- 读多写少：`RWMutex`
- 计数/状态位：`atomic`
- 一次初始化：`sync.Once`
- 限制并发：缓冲 channel 做 semaphore

---

## 4. 工程化（项目深挖常问）

### 4.1 context

- handler 入口拿到 ctx 向下传，不存全局。
- 下游调用优先用支持 ctx 的 API（http/db/grpc）。
- 超时：`WithTimeout`；记得 `defer cancel()`。

### 4.2 错误处理

- 向上返回，不吞。
- 包装：`fmt.Errorf("xxx: %w", err)`
- 判断：`errors.Is/As`

### 4.3 测试

- 表驱动测试
- 并发必跑 `-race`
- benchmark 看 `allocs/op`

### 4.4 性能排查（会加分）

- CPU/Heap：`pprof`
- 逃逸分析：知道“为什么会逃逸”与“怎么减少”即可

---

## 5. 代码题模板（背下来就能写）

### 5.1 sync.Once（带错误）

```go
var once sync.Once
var v *X
var initErr error

func Get() (*X, error) {
  once.Do(func() { v, initErr = Init() })
  return v, initErr
}
```

### 5.2 worker（可取消可退出）

```go
func worker(ctx context.Context, jobs <-chan Job) {
  for {
    select {
    case <-ctx.Done():
      return
    case j, ok := <-jobs:
      if !ok { return }
      _ = j
    }
  }
}
```

### 5.3 限流并发（semaphore）

```go
sem := make(chan struct{}, 10)
for _, item := range items {
  sem <- struct{}{}
  go func(x T) {
    defer func(){ <-sem }()
    _ = x
  }(item)
}
```

---

## 6. 题库（背答案）

基础：
- 零值是什么？为什么强调零值可用？
- `range` 遍历 slice/map/string 差异？
- `defer` 参数求值时机？

接口：
- 隐式实现的优缺点？
- `nil` 接口陷阱如何定位/修复？
- 组合（embedding）与继承的区别？

并发：
- channel vs mutex 什么时候用哪个？
- 如何避免 goroutine 泄漏？
- 如何优雅退出（超时/取消/收敛）？

工程：
- module / replace / vendor 场景？
- 配置/日志/指标怎么做？

---

## 7. 你回我 4 句，我给你定制版（只需文字）

1) 岗位方向：后端 / 微服务 / 爬虫 / DevOps / SDK？  
2) 级别：初级/中级/高级？  
3) 项目栈：Gin/Grpc/Kafka/Redis/MySQL…？  
4) 你最弱三块：并发/网络/数据库/算法/工程化/性能？

我会给：重点清单 + 10 道必考题 + 3 道代码题 + 项目追问脚本（含标准答法）。

