// OpenClaw API 工具函数
// 注意：由于微信小程序的网络限制，需要通过后端服务转发请求到 OpenClaw

// OpenClaw 配置
// 这些配置应该在后端服务中设置，前端只调用后端接口
export const OPENCLAW_CONFIG = {
  // 后端服务地址（用于转发 OpenClaw 请求）
  // 如果 OpenClaw 支持 CORS 且配置了域名白名单，也可以直接调用
  BACKEND_API: 'https://cyberis.cn/api/openclaw', // 后端转发接口
  // 如果直接调用 OpenClaw（需要配置域名白名单）
  DIRECT_API: 'http://127.0.0.1:18789/hooks/agent', // OpenClaw 直接地址（仅开发环境）
  
  // Agent 配置
  AGENT_NAME: 'WeChatMiniApp',
  MODEL: 'zai/glm-4.7', // 默认模型
  DELIVER: false // 是否投递模式
}

/**
 * 获取用户 openid（通过微信登录）
 * @returns Promise<string> 返回用户的 openid
 */
export const getWeChatOpenId = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 先检查本地存储
    const cachedOpenId = wx.getStorageSync('wechat_openid')
    if (cachedOpenId) {
      console.log('从缓存读取 openid:', cachedOpenId)
      resolve(cachedOpenId)
      return
    }

    // 获取微信登录 code
    wx.login({
      success: (loginRes) => {
        if (loginRes.code) {
          console.log('获取到微信登录 code:', loginRes.code)
          
          // 将 code 发送到后端换取 openid
          // 注意：这里需要后端服务提供接口，使用 AppID 和 AppSecret 换取 openid
          wx.request({
            url: `${OPENCLAW_CONFIG.BACKEND_API}/get-openid`,
            method: 'POST',
            header: {
              'Content-Type': 'application/json'
            },
            data: {
              code: loginRes.code
            },
            success: (res) => {
              if (res.statusCode === 200) {
                const data = res.data as any
                if (data.openid) {
                  // 缓存 openid
                  wx.setStorageSync('wechat_openid', data.openid)
                  console.log('获取 openid 成功:', data.openid)
                  resolve(data.openid)
                } else {
                  // 后端返回格式错误，使用降级方案
                  console.warn('后端返回格式错误，使用 code 作为临时标识（仅开发测试）')
                  const tempOpenId = `temp_${loginRes.code}_${Date.now()}`
                  wx.setStorageSync('wechat_openid', tempOpenId)
                  resolve(tempOpenId)
                }
              } else if (res.statusCode === 404) {
                // 后端接口不存在（404），使用降级方案
                console.warn('后端接口不存在（404），使用 code 作为临时标识（仅开发测试）')
                console.warn('提示：请按照 OpenClaw接入说明.md 配置后端服务')
                const tempOpenId = `temp_${loginRes.code}_${Date.now()}`
                wx.setStorageSync('wechat_openid', tempOpenId)
                resolve(tempOpenId)
              } else {
                // 其他错误，也使用降级方案，避免阻塞用户使用
                console.warn(`获取 openid 失败（${res.statusCode}），使用 code 作为临时标识（仅开发测试）`)
                const tempOpenId = `temp_${loginRes.code}_${Date.now()}`
                wx.setStorageSync('wechat_openid', tempOpenId)
                resolve(tempOpenId)
              }
            },
            fail: (err) => {
              console.error('获取 openid 请求失败:', err)
              // 如果后端接口不存在，使用 code 作为临时标识
              // 注意：这不是真正的 openid，仅用于开发测试
              console.warn('后端接口请求失败，使用 code 作为临时标识（仅开发测试）')
              console.warn('提示：请按照 OpenClaw接入说明.md 配置后端服务')
              const tempOpenId = `temp_${loginRes.code}_${Date.now()}`
              wx.setStorageSync('wechat_openid', tempOpenId)
              resolve(tempOpenId)
            }
          })
        } else {
          reject(new Error('获取微信登录 code 失败'))
        }
      },
      fail: (err) => {
        reject(new Error(`微信登录失败: ${err.errMsg || '未知错误'}`))
      }
    })
  })
}

/**
 * 生成会话 key
 * @param openid 用户 openid
 * @returns string 会话 key
 */
export const generateSessionKey = (openid: string): string => {
  return `wechat:miniapp:${openid}`
}

/**
 * 发送消息到 OpenClaw（通过后端服务转发）
 * @param message 用户消息
 * @param openid 用户 openid（可选，如果不提供会自动获取）
 * @param model 模型名称（可选，默认使用配置中的模型）
 * @returns Promise<any> 返回 OpenClaw 的响应
 */
export const sendMessageToOpenClaw = async (
  message: string,
  openid?: string,
  model?: string
): Promise<any> => {
  return new Promise(async (resolve, reject) => {
    if (!message || !message.trim()) {
      reject(new Error('消息内容不能为空'))
      return
    }

    try {
      // 获取 openid（如果没有提供）
      let userOpenId = openid
      if (!userOpenId) {
        userOpenId = await getWeChatOpenId()
      }

      // 生成会话 key
      const sessionKey = generateSessionKey(userOpenId)

      console.log('发送消息到 OpenClaw:', {
        message: message.substring(0, 50) + '...',
        sessionKey,
        model: model || OPENCLAW_CONFIG.MODEL
      })

      // 通过后端服务转发请求
      wx.request({
        url: `${OPENCLAW_CONFIG.BACKEND_API}/chat`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json'
        },
        data: {
          message: message.trim(),
          name: OPENCLAW_CONFIG.AGENT_NAME,
          sessionKey: sessionKey,
          deliver: OPENCLAW_CONFIG.DELIVER,
          model: model || OPENCLAW_CONFIG.MODEL
        },
        timeout: 120000, // 120秒超时
        success: (res) => {
          console.log('OpenClaw 响应:', res.statusCode, res.data)

          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
              console.log('OpenClaw 解析后的响应数据:', {
                hasSummary: !!data.summary,
                sessionKey: data.sessionKey
              })
              resolve(data)
            } catch (e) {
              console.error('OpenClaw 响应解析失败:', e, res.data)
              reject(new Error('响应解析失败，请检查后端返回格式'))
            }
          } else if (res.statusCode === 401) {
            reject(new Error('OpenClaw 认证失败，请检查后端配置'))
          } else if (res.statusCode === 404) {
            // 404 错误：后端接口未实现
            const isHtml404 = typeof res.data === 'string' && res.data.includes('Page not found')
            if (isHtml404) {
              reject(new Error('后端接口未实现：/api/openclaw/chat\n\n请按照 OpenClaw接入说明.md 配置后端服务，实现该接口。'))
            } else {
              reject(new Error('OpenClaw 服务未找到（404），请检查后端配置\n\n提示：请按照 OpenClaw接入说明.md 配置后端服务'))
            }
          } else if (res.statusCode === 500) {
            reject(new Error('OpenClaw 服务器错误，请稍后重试'))
          } else {
            let errorMsg = `请求失败: ${res.statusCode}`
            try {
              const errorData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
              errorMsg = errorData.detail || errorData.message || errorMsg
            } catch (e) {
              if (typeof res.data === 'string') {
                errorMsg = res.data
              }
            }
            reject(new Error(errorMsg))
          }
        },
        fail: (err) => {
          console.error('OpenClaw 请求失败:', err)
          reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
        }
      })
    } catch (error: any) {
      console.error('发送消息到 OpenClaw 异常:', error)
      reject(new Error(error.message || '发送消息失败'))
    }
  })
}

/**
 * 流式发送消息到 OpenClaw（如果支持）
 * 注意：微信小程序可能不完全支持流式响应，此函数使用阻塞模式模拟流式效果
 * @param message 用户消息
 * @param openid 用户 openid（可选）
 * @param model 模型名称（可选）
 * @param onDelta 接收到增量内容时的回调（可选）
 * @param onDone 接收完成时的回调（可选）
 * @param onError 发生错误时的回调（可选）
 * @returns Promise<any> 返回完整结果
 */
export const sendMessageToOpenClawStream = async (
  message: string,
  openid?: string,
  model?: string,
  onDelta?: (content: string) => void,
  onDone?: (data: any) => void,
  onError?: (error: string) => void
): Promise<any> => {
  // 微信小程序不支持真正的流式响应，所以使用阻塞模式
  // 如果需要流式效果，可以在前端模拟打字机效果
  return sendMessageToOpenClaw(message, openid, model)
    .then((result) => {
      // 模拟流式效果：将完整答案逐字显示
      if (onDelta && result.summary) {
        const summary = result.summary
        let index = 0
        const interval = setInterval(() => {
          if (index < summary.length) {
            const chunk = summary.substring(index, Math.min(index + 3, summary.length))
            onDelta(chunk)
            index += 3
          } else {
            clearInterval(interval)
            if (onDone) {
              onDone(result)
            }
          }
        }, 50) // 每50ms显示3个字符
      } else if (onDone) {
        onDone(result)
      }
      return result
    })
    .catch((error) => {
      if (onError) {
        onError(error.message || '发送消息失败')
      }
      throw error
    })
}

