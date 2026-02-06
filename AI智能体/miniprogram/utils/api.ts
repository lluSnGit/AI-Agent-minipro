// API工具函数
// 注意：小程序正式环境需要使用HTTPS，开发环境可以使用HTTP（需在开发工具中关闭域名校验）
export const API_BASE = 'https://cyberis.cn/api'  // 使用标准443端口，通过Nginx反向代理到后端8000端口
// 备用IP地址：'http://8.129.13.114:8000/api'
// 如果配置了HTTPS，可以使用：'https://cyberis.cn/api'

/**
 * 获取存储的access token
 */
export const getAccessToken = (): string | null => {
  const token = wx.getStorageSync('accessToken') || null
  if (token) {
    console.log('读取Token:', { length: token.length, prefix: token.substring(0, 20) + '...' })
  }
  return token
}

/**
 * 保存access token
 */
export const setAccessToken = (token: string): void => {
  console.log('保存Token:', { length: token.length, prefix: token.substring(0, 20) + '...', full: token })
  wx.setStorageSync('accessToken', token)
  // 验证保存是否成功
  const saved = wx.getStorageSync('accessToken')
  if (saved !== token) {
    console.error('Token保存失败！保存的值与原始值不一致')
  } else {
    console.log('Token保存成功，验证通过')
  }
}

/**
 * 获取存储的refresh token
 */
export const getRefreshToken = (): string | null => {
  return wx.getStorageSync('refreshToken') || null
}

/**
 * 保存refresh token
 */
export const setRefreshToken = (token: string): void => {
  wx.setStorageSync('refreshToken', token)
}

/**
 * 清除所有token
 */
export const clearTokens = (): void => {
  wx.removeStorageSync('accessToken')
  wx.removeStorageSync('refreshToken')
}

/**
 * 使用refresh token刷新access token
 * @returns Promise<string> 返回新的access token
 */
export const refreshAccessToken = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const refreshToken = getRefreshToken()
    
    if (!refreshToken) {
      reject(new Error('未找到refresh token，请重新登录'))
      return
    }
    
    console.log('开始刷新access token...')
    wx.request({
      url: `${API_BASE}/auth/token/refresh`,  // 使用正确的刷新接口路径
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        refresh: refreshToken
      },
      timeout: 30000, // 30秒超时
      success: (res) => {
        if (res.statusCode === 200) {
          const data = res.data as any
          if (data.access) {
            // 保存新的access token
            setAccessToken(data.access)
            // 如果有新的refresh token，也保存
            if (data.refresh) {
              setRefreshToken(data.refresh)
            }
            console.log('Token刷新成功，新的access token长度:', data.access.length)
            resolve(data.access)
          } else {
            reject(new Error('刷新token响应格式错误，未找到access token'))
          }
        } else if (res.statusCode === 404) {
          // 404 说明后端可能不支持 token 刷新接口，不报错，静默处理
          console.warn('Token刷新接口不存在(404)，后端可能不支持token刷新功能')
          reject(new Error('REFRESH_API_NOT_FOUND')) // 使用特殊错误码，让调用方知道是接口不存在
        } else {
          // 其他错误，刷新失败，清除所有token，需要重新登录
          clearTokens()
          let errorMsg = `刷新token失败: ${res.statusCode}`
          try {
            const errorData = res.data as any
            errorMsg = errorData.detail || errorData.message || errorMsg
          } catch (e) {
            // 忽略解析错误
          }
          reject(new Error(errorMsg))
        }
      },
      fail: (err) => {
        reject(new Error(`网络错误: ${err.errMsg || '刷新token失败'}`))
      }
    })
  })
}

/**
 * 获取有效的access token（如果过期则自动刷新）
 * @returns Promise<string> 返回有效的access token
 */
export const getValidAccessToken = async (): Promise<string> => {
  const accessToken = getAccessToken()
  
  if (!accessToken) {
    throw new Error('未找到access token，请先登录')
  }
  
  // 尝试使用当前token，如果遇到401错误，会自动刷新
  // 这里先返回当前token，实际的刷新逻辑在API调用失败时处理
  return accessToken
}

/**
 * 带自动刷新token的请求包装函数
 * 当遇到401错误时，自动刷新token并重试一次
 * @param requestFn 请求函数，返回 Promise
 * @param maxRetries 最大重试次数，默认1次
 * @returns Promise<any> 返回请求结果
 */
export const requestWithAutoRefresh = async <T>(
  requestFn: () => Promise<T>,
  maxRetries: number = 1
): Promise<T> => {
  try {
    return await requestFn()
  } catch (error: any) {
    // 检查是否是401错误（token过期）
    const is401Error = error?.message?.includes('401') || 
                      error?.message?.includes('Token已过期') ||
                      error?.message?.includes('Token已无效')
    
    if (is401Error && maxRetries > 0) {
      console.log('检测到401错误，尝试自动刷新token并重试...')
      try {
        // 尝试刷新token
        const newToken = await refreshAccessToken()
        console.log('Token刷新成功，重试请求...')
        // 使用新token重试请求
        return await requestWithAutoRefresh(requestFn, maxRetries - 1)
      } catch (refreshError) {
        console.error('Token刷新失败:', refreshError)
        // 刷新失败，清除token
        clearTokens()
        throw new Error('Token已过期且刷新失败，请重新登录')
      }
    }
    // 不是401错误，或者重试次数用完，直接抛出错误
    throw error
  }
}

/**
 * 邮箱密码登录
 * @param email 邮箱
 * @param password 密码
 * @returns Promise<{access: string, refresh: string}> 返回tokens
 */
export const loginWithPassword = async (email: string, password: string): Promise<{access: string, refresh: string}> => {
  return new Promise((resolve, reject) => {
    console.log('开始登录:', email)
    wx.request({
      url: `${API_BASE}/auth/login-password`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        email: email,
        password: password
      },
      timeout: 30000, // 30秒超时
      success: (res) => {
        console.log('登录响应:', res.statusCode, res.data)
        if (res.statusCode === 200) {
          const data = res.data as any
          if (data.tokens && data.tokens.access) {
            // 保存tokens
            setAccessToken(data.tokens.access)
            if (data.tokens.refresh) {
              setRefreshToken(data.tokens.refresh)
            }
            console.log('Token已保存，access token长度:', data.tokens.access.length)
            resolve({
              access: data.tokens.access,
              refresh: data.tokens.refresh || ''
            })
          } else {
            console.error('登录响应格式错误:', data)
            reject(new Error('登录响应格式错误，未找到tokens'))
          }
        } else {
          // 详细解析错误信息
          let errorMsg = `登录失败: ${res.statusCode}`
          try {
            // 尝试解析JSON错误
            if (typeof res.data === 'string') {
              // 如果是HTML错误页面，尝试提取信息
              if (res.data.includes('Internal Server Error')) {
                errorMsg = '服务器内部错误，请检查：\n1. 后端服务是否正常运行\n2. API地址是否正确\n3. 账号密码是否正确'
              } else {
                // 尝试解析为JSON
                try {
                  const errorData = JSON.parse(res.data)
                  errorMsg = errorData.detail || errorData.message || errorMsg
                } catch (e) {
                  errorMsg = res.data.substring(0, 100) // 截取前100个字符
                }
              }
            } else if (typeof res.data === 'object') {
              errorMsg = (res.data as any)?.detail || (res.data as any)?.message || errorMsg
            }
          } catch (e) {
            console.error('解析错误信息失败:', e)
          }
          console.error('登录失败:', res.statusCode, errorMsg, res.data)
          reject(new Error(errorMsg))
        }
      },
      fail: (err) => {
        console.error('登录请求失败:', err)
        reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
      }
    })
  })
}

/**
 * 邮箱验证码登录
 * @param email 邮箱
 * @param code 验证码
 * @returns Promise<{access: string, refresh: string}> 返回tokens
 */
export const loginWithCode = async (email: string, code: string): Promise<{access: string, refresh: string}> => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/auth/login-code`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        email: email,
        code: code
      },
      timeout: 30000, // 30秒超时
      success: (res) => {
        if (res.statusCode === 200) {
          const data = res.data as any
          if (data.tokens && data.tokens.access) {
            // 保存tokens
            setAccessToken(data.tokens.access)
            if (data.tokens.refresh) {
              setRefreshToken(data.tokens.refresh)
            }
            resolve({
              access: data.tokens.access,
              refresh: data.tokens.refresh || ''
            })
          } else {
            reject(new Error('登录响应格式错误'))
          }
        } else {
          const errorMsg = (res.data as any)?.detail || `登录失败: ${res.statusCode}`
          reject(new Error(errorMsg))
        }
      },
      fail: (err) => {
        reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
      }
    })
  })
}

/**
 * 发送验证码
 * @param email 邮箱
 * @returns Promise<void>
 */
export const sendVerificationCode = async (email: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}/auth/send-code`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        email: email
      },
      timeout: 30000, // 30秒超时
      success: (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve()
        } else {
          const errorMsg = (res.data as any)?.detail || `发送验证码失败: ${res.statusCode}`
          reject(new Error(errorMsg))
        }
      },
      fail: (err) => {
        reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
      }
    })
  })
}

/**
 * 文生图API调用
 * 先尝试form-urlencoded格式，如果失败再尝试multipart/form-data格式
 * @param prompt 提示词
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateImage = async (
  prompt: string, 
  negativePrompt?: string, 
  seed?: number
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    // 先尝试使用 JSON 格式（更可靠，兼容真机和开发工具）
    // 如果后端支持 JSON，就不需要使用文件上传
    console.log('尝试使用 JSON 格式发送请求（兼容真机和开发工具）')
    tryJsonRequest(prompt, accessToken, negativePrompt, seed, 'text-to-image', resolve, reject)
  })
}

/**
 * 尝试使用 JSON 格式发送请求（优先使用，兼容真机和开发工具）
 */
function tryJsonRequest(
  prompt: string,
  accessToken: string,
  negativePrompt: string | undefined,
  seed: number | undefined,
  workflowType: string = 'text-to-image',
  resolve: (value: any) => void,
  reject: (reason?: any) => void
) {
  let retryCount = 0 // 重试计数器
  const maxRetries = 10 // 最大重试次数
  const retryInterval = 10000 // 重试间隔10秒
  
  const requestData: any = {
    prompt: prompt,
    workflow_type: workflowType
  }
  
  if (negativePrompt) {
    requestData['negative_prompt'] = negativePrompt
  }
  if (seed !== undefined) {
    requestData['seed'] = seed.toString()
  }

  const makeRequest = () => {
    console.log('发送 JSON 格式请求:', {
      url: `${API_BASE}/chat/images/generate`,
      requestData,
      hasToken: !!accessToken,
      retryCount: retryCount > 0 ? `${retryCount}/${maxRetries}` : '首次'
    })

    wx.request({
      url: `${API_BASE}/chat/images/generate`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: requestData,
      timeout: 600000, // 10分钟超时
      success: (res) => {
        console.log('JSON 格式响应:', res.statusCode, res.data)
        
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            console.log('解析后的响应数据:', data)
            resolve(data)
          } catch (e) {
            console.log('响应不是JSON格式，直接返回:', res.data)
            resolve(res.data)
          }
        } else if (res.statusCode === 400 || res.statusCode === 415) {
          // 400 或 415 可能表示后端不支持 JSON，回退到 multipart/form-data
          console.warn('后端不支持 JSON 格式，回退到 multipart/form-data')
          tryMultipartFormData(prompt, accessToken, negativePrompt, seed, workflowType, resolve, reject)
        } else if (res.statusCode === 401) {
          // Token过期，尝试刷新
          console.warn('Token过期（401），尝试使用refresh token刷新...')
          refreshAccessToken()
            .then((newToken) => {
              console.log('Token刷新成功，使用新token重试请求...')
              tryJsonRequest(prompt, newToken, negativePrompt, seed, workflowType, resolve, reject)
            })
            .catch((refreshError) => {
              console.error('Token刷新失败:', refreshError)
              clearTokens()
              reject(new Error('Token已过期且刷新失败，请重新登录'))
            })
        } else if (res.statusCode === 500) {
          // 500错误：服务器内部错误，可能是后台正在处理
          if (retryCount < maxRetries) {
            retryCount++
            console.warn(`JSON请求：收到500错误，${retryInterval/1000}秒后重试（第${retryCount}/${maxRetries}次）...`)
            setTimeout(() => {
              console.log('JSON请求：开始重试（收到500错误）...')
              makeRequest() // 重试请求
            }, retryInterval)
          } else {
            // 超过最大重试次数，回退到 multipart/form-data
            console.warn('JSON请求：500错误重试次数已达上限，回退到 multipart/form-data')
            tryMultipartFormData(prompt, accessToken, negativePrompt, seed, workflowType, resolve, reject)
          }
        } else {
          let errorMsg = `请求失败: ${res.statusCode}`
          try {
            const errorData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            errorMsg = errorData.detail || errorData.message || errorMsg
          } catch (e) {
            errorMsg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data) || errorMsg
          }
          reject(new Error(errorMsg))
        }
      },
      fail: (err) => {
        console.error('JSON 格式请求失败:', err)
        // 网络错误，回退到 multipart/form-data
        console.warn('JSON 请求失败，回退到 multipart/form-data')
        tryMultipartFormData(prompt, accessToken, negativePrompt, seed, workflowType, resolve, reject)
      }
    })
  }
  
  // 开始第一次请求
  makeRequest()
}

/**
 * AI模特API调用
 * @param prompt AI模特描述提示词（必填）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateAIModel = async (
  prompt: string,
  negativePrompt?: string,
  seed?: number
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    // 先尝试使用 JSON 格式（更可靠，兼容真机和开发工具）
    // 如果后端不支持 JSON，会自动回退到 multipart/form-data
    console.log('AI模特：尝试使用 JSON 格式发送请求（兼容真机和开发工具）')
    tryJsonRequest(prompt, accessToken, negativePrompt, seed, 'ai-model', resolve, reject)
  })
}

/**
 * 文生视频API调用
 * @param prompt 视频描述提示词（必填）
 * @param nFrames 帧数，150=5秒，300=10秒（必填，默认150）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @param onProgress 进度回调函数，接收已等待的秒数（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateTextToVideo = async (
  prompt: string,
  nFrames: number = 150,
  negativePrompt?: string,
  seed?: number,
  onProgress?: (elapsed: number) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    console.log('文生视频：使用multipart/form-data格式', {
      promptLength: prompt?.length || 0,
      nFrames,
      hasToken: !!accessToken
    })

    // 构建formData
    const formData: any = {
      'workflow_type': 'text-to-video', // 必填：指定为文生视频工作流
      'prompt': prompt, // 必填：视频内容描述
      'n_frames': nFrames.toString() // 必填：帧数
    }
    
    // 选填参数
    if (negativePrompt) {
      formData['negative_prompt'] = negativePrompt
    }
    if (seed !== undefined && seed !== null) {
      formData['seed'] = seed.toString()
    }
    
    console.log('文生视频请求参数:', {
      workflow_type: formData['workflow_type'],
      prompt: formData['prompt'],
      n_frames: formData['n_frames'],
      hasNegativePrompt: !!formData['negative_prompt'],
      hasSeed: formData['seed'] !== undefined
    })

    // 发送请求（使用wx.request发送JSON数据，后端应该能够处理）
    // 注意：虽然文档说是multipart/form-data，但小程序中如果没有文件上传，可以使用JSON格式
    wx.request({
      url: `${API_BASE}/chat/images/generate`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: formData,
      timeout: 1200000, // 20分钟超时（1200秒 = 1200000毫秒）
      success: (res) => {
        console.log('文生视频响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)

        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            console.log('文生视频解析后的响应数据:', {
              hasPromptId: !!data.prompt_id,
              videosCount: data.videos?.length || 0,
              imagesCount: data.images?.length || 0,
              cost: data.cost,
              balance: data.balance
            })
            
            // 检查是否返回了 prompt_id（需要轮询）
            if (data.prompt_id) {
              // 检查是否已经包含 videos（后端可能已经直接返回结果）
              if (data.videos && Array.isArray(data.videos) && data.videos.length > 0) {
                console.log('文生视频：检测到 prompt_id 但已包含 videos，直接返回结果（不轮询）')
                resolve(data)
              } else {
                console.log('文生视频：检测到 prompt_id，开始轮询任务状态...')
                // 使用轮询机制获取结果（直接实现轮询逻辑，避免循环依赖）
                const startTime = Date.now()
                const pollInterval = 3000 // 每3秒轮询一次
                const maxWaitTime = 1200 // 20分钟超时
                
                const poll = () => {
                  const elapsed = (Date.now() - startTime) / 1000
                  
                  // 调用进度回调
                  if (onProgress) {
                    onProgress(Math.round(elapsed))
                  }
                  
                  if (elapsed > maxWaitTime) {
                    reject(new Error(`任务超时：超过最大等待时间（${Math.round(maxWaitTime)}秒）`))
                    return
                  }
                  
                  // 查询任务状态
                  wx.request({
                    url: `${API_BASE}/chat/images/multi-generate/status/${data.prompt_id}`,
                    method: 'GET',
                    header: {
                      'Authorization': `Bearer ${accessToken}`
                    },
                    timeout: 30000,
                    success: (res) => {
                      if (res.statusCode === 200 || res.statusCode === 201) {
                        try {
                          const pollData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                          
                          // 检查任务状态
                          if (pollData.status === 'completed' || pollData.status === 'success') {
                            console.log('✅ 文生视频任务完成！耗时:', Math.round(elapsed), '秒')
                            resolve(pollData)
                          } else if (pollData.status === 'failed' || pollData.status === 'error') {
                            reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                          } else {
                            // 任务还在执行中，继续轮询
                            console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                            setTimeout(poll, pollInterval)
                          }
                        } catch (e) {
                          // 如果解析失败，可能是任务还在执行中
                          console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else if (res.statusCode === 404) {
                        // 404 可能表示接口不存在或任务还未完成
                        if (elapsed > 30) {
                          reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                        } else {
                          console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else {
                        reject(new Error(`查询任务状态失败: ${res.statusCode}`))
                      }
                    },
                    fail: (err) => {
                      // 如果是404（任务还未完成），继续轮询
                      if (err.errMsg && err.errMsg.includes('404')) {
                        console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                        setTimeout(poll, pollInterval)
                      } else {
                        reject(new Error(`网络错误: ${err.errMsg || '查询任务状态失败'}`))
                      }
                    }
                  })
                }
                
                // 开始轮询
                poll()
              }
            } else {
              // 直接返回结果
              resolve(data)
            }
          } catch (e) {
            console.error('文生视频响应解析失败:', e, res.data)
            reject(new Error('响应解析失败，请检查后端返回格式'))
          }
        } else if (res.statusCode === 401) {
          clearTokens()
          reject(new Error('Token已过期或无效，请重新登录'))
        } else if (res.statusCode === 402) {
          reject(new Error('星星余额不足，请充值'))
        } else if (res.statusCode === 500) {
          // 500 内部服务器错误，可能是响应数据过大导致
          // 尝试从响应头或响应体中提取 prompt_id
          let promptId: string | null = null
          
          // 如果响应头中没有，尝试从响应体中提取
          if (typeof res.data === 'string') {
            try {
              const promptIdMatch = res.data.match(/["']prompt_id["']\s*:\s*["']([^"']+)["']/)
              if (promptIdMatch) {
                promptId = promptIdMatch[1]
              }
            } catch (e) {
              console.error('文生视频：从响应体提取 prompt_id 失败:', e)
            }
          }
          
          if (promptId) {
            // 如果有 prompt_id，开始轮询
            console.log('文生视频：500错误但检测到 prompt_id，开始轮询...', promptId)
            const startTime = Date.now()
            const pollInterval = 3000
            const maxWaitTime = 1200
            
            const poll = () => {
              const elapsed = (Date.now() - startTime) / 1000
              if (onProgress) {
                onProgress(Math.round(elapsed))
              }
              if (elapsed > maxWaitTime) {
                reject(new Error(`任务超时：超过最大等待时间（${Math.round(maxWaitTime)}秒）`))
                return
              }
              
              wx.request({
                url: `${API_BASE}/chat/images/multi-generate/status/${promptId}`,
                method: 'GET',
                header: {
                  'Authorization': `Bearer ${accessToken}`
                },
                timeout: 30000,
                success: (pollRes) => {
                  if (pollRes.statusCode === 200 || pollRes.statusCode === 201) {
                    try {
                      const pollData = typeof pollRes.data === 'string' ? JSON.parse(pollRes.data) : pollRes.data
                      if (pollData.status === 'completed' || pollData.status === 'success') {
                        console.log('✅ 文生视频任务完成！耗时:', Math.round(elapsed), '秒')
                        resolve(pollData)
                      } else if (pollData.status === 'failed' || pollData.status === 'error') {
                        reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                      } else {
                        console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                        setTimeout(poll, pollInterval)
                      }
                    } catch (e) {
                      console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                      setTimeout(poll, pollInterval)
                    }
                  } else if (pollRes.statusCode === 404) {
                    if (elapsed > 30) {
                      reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                    } else {
                      console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                      setTimeout(poll, pollInterval)
                    }
                  } else {
                    reject(new Error(`查询任务状态失败: ${pollRes.statusCode}`))
                  }
                },
                fail: (err) => {
                  if (err.errMsg && err.errMsg.includes('404')) {
                    if (elapsed > 30) {
                      reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                    } else {
                      console.log(`⏳ 文生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                      setTimeout(poll, pollInterval)
                    }
                  } else {
                    reject(new Error(`网络错误: ${err.errMsg || '查询任务状态失败'}`))
                  }
                }
              })
            }
            poll()
          } else {
            // 没有 prompt_id，开始重试（保持loading状态）
            console.warn('文生视频：500错误且未找到 prompt_id，开始重试...')
            
            // 重试机制：每60秒重试一次，最多重试60次（60分钟）
            const retryRequest = (retryCount: number = 0) => {
              const maxRetries = 60 // 最多重试60次（约60分钟，每次间隔60秒）
              if (retryCount >= maxRetries) {
                reject(new Error('服务器处理时间过长，请稍后手动重试'))
                return
              }
              
              console.log(`文生视频：第${retryCount + 1}次重试（收到500错误）...`)
              
              // 如果onProgress回调存在，更新进度提示
              if (onProgress) {
                const elapsed = retryCount * 60 // 每次重试间隔60秒
                onProgress(elapsed)
              }
              
              wx.request({
                url: `${API_BASE}/chat/images/generate`,
                method: 'POST',
                header: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                data: formData,
                timeout: 1200000,
                success: (retryRes) => {
                  // 递归处理响应（调用相同的处理逻辑）
                  if (retryRes.statusCode === 200 || retryRes.statusCode === 201) {
                    try {
                      const data = typeof retryRes.data === 'string' ? JSON.parse(retryRes.data) : retryRes.data
                      resolve(data)
                    } catch (e) {
                      resolve(retryRes.data)
                    }
                  } else if (retryRes.statusCode === 500) {
                    // 如果还是500，继续重试
                    console.warn(`文生视频：重试后仍收到500错误，60秒后继续重试...`)
                    setTimeout(() => retryRequest(retryCount + 1), 60000) // 60秒后重试
                  } else {
                    let errorMsg = `请求失败: ${retryRes.statusCode}`
                    try {
                      const errorData = typeof retryRes.data === 'string' ? JSON.parse(retryRes.data) : retryRes.data
                      errorMsg = errorData.detail || errorData.message || errorMsg
                    } catch (e) {
                      errorMsg = typeof retryRes.data === 'string' ? retryRes.data : JSON.stringify(retryRes.data) || errorMsg
                    }
                    reject(new Error(errorMsg))
                  }
                },
                fail: (_err) => {
                  // 网络错误也重试
                  console.warn(`文生视频：网络错误，60秒后继续重试...`)
                  setTimeout(() => retryRequest(retryCount + 1), 60000) // 60秒后重试
                }
              })
            }
            
            // 立即开始第一次重试
            setTimeout(() => retryRequest(0), 60000) // 60秒后开始第一次重试
          }
        } else if (res.statusCode === 502) {
          reject(new Error('ComfyUI服务错误，请稍后重试'))
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
        console.error('文生视频请求失败:', err)
        reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
      }
    })
  })
}

/**
 * 图生视频API调用
 * @param imagePath 输入图片文件路径（必填）
 * @param nFrames 帧数，150=5秒，300=10秒（必填，默认150）
 * @param prompt 视频描述提示词（5秒视频必填）
 * @param prompt1 第一个视频提示词（10秒视频必填，0-5秒）
 * @param prompt2 第二个视频提示词（10秒视频必填，5-10秒）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @param onProgress 进度回调函数，接收已等待的秒数（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateImageToVideo = async (
  imagePath: string,
  nFrames: number = 150,
  prompt?: string,
  prompt1?: string,
  prompt2?: string,
  negativePrompt?: string,
  seed?: number,
  onProgress?: (elapsed: number) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    // 验证参数
    if (nFrames === 300) {
      // 10秒视频需要两个提示词
      if (!prompt1 || !prompt2) {
        reject(new Error('10秒视频需要提供两个提示词（prompt1和prompt2）'))
        return
      }
    } else {
      // 5秒视频需要一个提示词
      if (!prompt) {
        reject(new Error('5秒视频需要提供提示词'))
        return
      }
    }

    const fs = wx.getFileSystemManager()

    console.log('图生视频：使用multipart/form-data格式上传图片', {
      imagePath,
      nFrames,
      promptLength: prompt?.length || 0,
      prompt1Length: prompt1?.length || 0,
      prompt2Length: prompt2?.length || 0,
      hasToken: !!accessToken
    })

    // 先检查文件信息（兼容真机和开发工具）
    // 验证文件路径格式
    if (!imagePath || typeof imagePath !== 'string') {
      reject(new Error('图片路径无效，请重新选择图片'))
      return
    }
    
    fs.getFileInfo({
      filePath: imagePath,
      success: (info) => {
        const sizeKB = Math.round(info.size / 1024)
        console.log('图生视频图片文件信息:', { 
          size: info.size, 
          sizeKB: sizeKB,
          path: imagePath,
          isValid: info.size > 0
        })
        
        if (info.size === 0) {
          reject(new Error('图片文件为空，请重新选择图片'))
          return
        }
        
        // 构建formData
        const formData: any = {
          'workflow_type': 'image-to-video', // 必填：指定为图生视频工作流
          'n_frames': nFrames.toString() // 必填：帧数
        }
        
        // 根据视频时长添加不同的提示词
        if (nFrames === 300) {
          // 10秒视频
          formData['prompt1'] = prompt1
          formData['prompt2'] = prompt2
        } else {
          // 5秒视频
          formData['prompt'] = prompt
        }
        
        // 选填参数
        if (negativePrompt) {
          formData['negative_prompt'] = negativePrompt
        }
        if (seed !== undefined && seed !== null) {
          formData['seed'] = seed.toString()
        }
        
        console.log('图生视频请求参数:', {
          workflow_type: formData['workflow_type'],
          n_frames: formData['n_frames'],
          hasPrompt: !!formData['prompt'],
          hasPrompt1: !!formData['prompt1'],
          hasPrompt2: !!formData['prompt2'],
          hasNegativePrompt: !!formData['negative_prompt'],
          hasSeed: formData['seed'] !== undefined
        })

        const parseUploadSuccess = (res: WechatMiniprogram.UploadFileSuccessCallbackResult) => {
          console.log('图生视频响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)

          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
              console.log('图生视频解析后的响应数据:', {
                hasPromptId: !!data.prompt_id,
                videosCount: data.videos?.length || 0,
                imagesCount: data.images?.length || 0,
                cost: data.cost,
                balance: data.balance
              })
              
              // 检查是否返回了 prompt_id（需要轮询）
              if (data.prompt_id) {
                // 检查是否已经包含 videos（后端可能已经直接返回结果）
                if (data.videos && Array.isArray(data.videos) && data.videos.length > 0) {
                  console.log('图生视频：检测到 prompt_id 但已包含 videos，直接返回结果（不轮询）')
                  resolve(data)
                } else {
                  console.log('图生视频：检测到 prompt_id，开始轮询任务状态...')
                  // 使用轮询机制获取结果
                  const startTime = Date.now()
                  const pollInterval = 3000 // 每3秒轮询一次
                  const maxWaitTime = 1800 // 30分钟超时（延长等待时间）
                  
                  const poll = () => {
                    const elapsed = (Date.now() - startTime) / 1000
                    
                    // 调用进度回调
                    if (onProgress) {
                      onProgress(Math.round(elapsed))
                    }
                    
                    if (elapsed > maxWaitTime) {
                      reject(new Error(`任务超时：超过最大等待时间（${Math.round(maxWaitTime)}秒）`))
                      return
                    }
                    
                    // 查询任务状态
                    wx.request({
                      url: `${API_BASE}/chat/images/multi-generate/status/${data.prompt_id}`,
                      method: 'GET',
                      header: {
                        'Authorization': `Bearer ${accessToken}`
                      },
                      timeout: 30000,
                      success: (res) => {
                        if (res.statusCode === 200 || res.statusCode === 201) {
                          try {
                            const pollData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                            
                            // 检查任务状态
                            if (pollData.status === 'completed' || pollData.status === 'success') {
                              console.log('✅ 图生视频任务完成！耗时:', Math.round(elapsed), '秒')
                              resolve(pollData)
                            } else if (pollData.status === 'failed' || pollData.status === 'error') {
                              reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                            } else {
                              // 任务还在执行中，继续轮询
                              console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                              setTimeout(poll, pollInterval)
                            }
                          } catch (e) {
                            // 如果解析失败，可能是任务还在执行中
                            console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                            setTimeout(poll, pollInterval)
                          }
                        } else if (res.statusCode === 404) {
                          // 404 可能表示接口不存在或任务还未完成
                          if (elapsed > 30) {
                            reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                          } else {
                            console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                            setTimeout(poll, pollInterval)
                          }
                        } else {
                          reject(new Error(`查询任务状态失败: ${res.statusCode}`))
                        }
                      },
                      fail: (err) => {
                        // 如果是404（任务还未完成），继续轮询
                        if (err.errMsg && err.errMsg.includes('404')) {
                          console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        } else {
                          reject(new Error(`网络错误: ${err.errMsg || '查询任务状态失败'}`))
                        }
                      }
                    })
                  }
                  
                  // 开始轮询
                  poll()
                }
              } else {
                // 直接返回结果
                resolve(data)
              }
            } catch (e) {
              console.error('图生视频响应解析失败:', e, res.data)
              reject(new Error('响应解析失败，请检查后端返回格式'))
            }
          } else if (res.statusCode === 401) {
            clearTokens()
            reject(new Error('Token已过期或无效，请重新登录'))
          } else if (res.statusCode === 402) {
            reject(new Error('星星余额不足，请充值'))
          } else if (res.statusCode === 500) {
            // 500 内部服务器错误，可能是响应数据过大导致
            // 尝试从响应头或响应体中提取 prompt_id
            let promptId: string | null = null
            
            // 如果响应头中没有，尝试从响应体中提取
            if (typeof res.data === 'string') {
              try {
                const promptIdMatch = res.data.match(/["']prompt_id["']\s*:\s*["']([^"']+)["']/)
                if (promptIdMatch) {
                  promptId = promptIdMatch[1]
                }
              } catch (e) {
                console.error('图生视频：从响应体提取 prompt_id 失败:', e)
              }
            }
            
            if (promptId) {
              // 如果有 prompt_id，开始轮询
              console.log('图生视频：500错误但检测到 prompt_id，开始轮询...', promptId)
              const startTime = Date.now()
              const pollInterval = 3000
              const maxWaitTime = 1800
              
              const poll = () => {
                const elapsed = (Date.now() - startTime) / 1000
                if (onProgress) {
                  onProgress(Math.round(elapsed))
                }
                if (elapsed > maxWaitTime) {
                  reject(new Error(`任务超时：超过最大等待时间（${Math.round(maxWaitTime)}秒）`))
                  return
                }
                
                wx.request({
                  url: `${API_BASE}/chat/images/multi-generate/status/${promptId}`,
                  method: 'GET',
                  header: {
                    'Authorization': `Bearer ${accessToken}`
                  },
                  timeout: 30000,
                  success: (pollRes) => {
                    if (pollRes.statusCode === 200 || pollRes.statusCode === 201) {
                      try {
                        const pollData = typeof pollRes.data === 'string' ? JSON.parse(pollRes.data) : pollRes.data
                        if (pollData.status === 'completed' || pollData.status === 'success') {
                          console.log('✅ 图生视频任务完成！耗时:', Math.round(elapsed), '秒')
                          resolve(pollData)
                        } else if (pollData.status === 'failed' || pollData.status === 'error') {
                          reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                        } else {
                          console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } catch (e) {
                        console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                        setTimeout(poll, pollInterval)
                      }
                    } else if (pollRes.statusCode === 404) {
                      if (elapsed > 30) {
                        reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                      } else {
                        console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                        setTimeout(poll, pollInterval)
                      }
                    } else {
                      reject(new Error(`查询任务状态失败: ${pollRes.statusCode}`))
                    }
                  },
                  fail: (err) => {
                    if (err.errMsg && err.errMsg.includes('404')) {
                      if (elapsed > 30) {
                        reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                      } else {
                        console.log(`⏳ 图生视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                        setTimeout(poll, pollInterval)
                      }
                    } else {
                      reject(new Error(`网络错误: ${err.errMsg || '查询任务状态失败'}`))
                    }
                  }
                })
              }
              poll()
            } else {
              // 没有 prompt_id，开始重试（保持loading状态）
              console.warn('图生视频：500错误且未找到 prompt_id，开始重试...')
              
              // 重试机制：每60秒重试一次，最多重试60次（60分钟）
              const retryUpload = (retryCount: number = 0) => {
                const maxRetries = 60 // 最多重试60次（约60分钟，每次间隔60秒）
                if (retryCount >= maxRetries) {
                  reject(new Error('服务器处理时间过长，请稍后手动重试'))
                  return
                }
                
                console.log(`图生视频：第${retryCount + 1}次重试（收到500错误）...`)
                
                // 如果onProgress回调存在，更新进度提示
                if (onProgress) {
                  const elapsed = retryCount * 60 // 每次重试间隔60秒
                  onProgress(elapsed)
                }
                
                // 使用 wx.uploadFile 重新上传
                wx.uploadFile({
                  url: `${API_BASE}/chat/images/generate`,
                  filePath: imagePath,
                  name: 'image', // 字段名必须是 'image'
                  formData: formData,
                  header: {
                    'Authorization': `Bearer ${accessToken}`
                  },
                  timeout: 1800000,
                  success: (retryRes) => {
                    // 递归处理响应（调用相同的处理逻辑）
                    if (retryRes.statusCode === 200 || retryRes.statusCode === 201) {
                      parseUploadSuccess(retryRes)
                    } else if (retryRes.statusCode === 500) {
                      // 如果还是500，继续重试
                      console.warn(`图生视频：重试后仍收到500错误，60秒后继续重试...`)
                      setTimeout(() => retryUpload(retryCount + 1), 60000) // 60秒后重试
                    } else {
                      let errorMsg = `请求失败: ${retryRes.statusCode}`
                      try {
                        const errorData = typeof retryRes.data === 'string' ? JSON.parse(retryRes.data) : retryRes.data
                        errorMsg = errorData.detail || errorData.message || errorMsg
                      } catch (e) {
                        errorMsg = typeof retryRes.data === 'string' ? retryRes.data : JSON.stringify(retryRes.data) || errorMsg
                      }
                      reject(new Error(errorMsg))
                    }
                  },
                  fail: (_err) => {
                    // 网络错误也重试
                    console.warn(`图生视频：网络错误，60秒后继续重试...`)
                    setTimeout(() => retryUpload(retryCount + 1), 60000) // 60秒后重试
                  }
                })
              }
              
              // 立即开始第一次重试
              setTimeout(() => retryUpload(0), 60000) // 60秒后开始第一次重试
            }
          } else if (res.statusCode === 502) {
            reject(new Error('ComfyUI服务错误，请稍后重试'))
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
        }

        // 使用 wx.uploadFile 上传图片
        wx.uploadFile({
          url: `${API_BASE}/chat/images/generate`,
          filePath: imagePath,
          name: 'image', // 字段名必须是 'image'
          formData: formData,
          header: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 1800000, // 30分钟超时（延长等待时间）
          success: parseUploadSuccess,
          fail: (err) => {
            console.error('图生视频上传失败:', err)
            reject(new Error(`网络错误: ${err.errMsg || '上传失败'}`))
          }
        })
      },
      fail: (err) => {
        console.error('图生视频：获取文件信息失败:', err)
        reject(new Error('无法读取图片文件，请重新选择'))
      }
    })
  })
}

/**
 * Dify智能客服API调用（阻塞模式）
 * @param query 用户问题（必填）
 * @param conversationId 对话ID（可选，用于继续已有对话）
 * @param inputs 工作流输入变量（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const sendDifyMessage = async (
  query: string,
  conversationId?: string | null,
  inputs?: Record<string, any>
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    if (!query || !query.trim()) {
      reject(new Error('请输入问题'))
      return
    }

    console.log('发送消息到Dify（阻塞模式）...', {
      queryLength: query.length,
      hasConversationId: !!conversationId,
      hasToken: !!accessToken
    })

    const requestData: any = {
      query: query.trim(),
      response_mode: 'blocking'
    }

    if (conversationId) {
      requestData.conversation_id = conversationId
    }

    if (inputs) {
      requestData.inputs = inputs
    }

    wx.request({
      url: `${API_BASE}/dify/chat`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      data: requestData,
      timeout: 120000, // 120秒超时
      success: (res) => {
        console.log('Dify响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)

        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            console.log('Dify解析后的响应数据:', {
              hasAnswer: !!data.answer,
              hasConversationId: !!data.conversation_id,
              hasMessageId: !!data.id,
              status: data.status
            })
            resolve(data)
          } catch (e) {
            console.error('Dify响应解析失败:', e, res.data)
            reject(new Error('响应解析失败，请检查后端返回格式'))
          }
        } else if (res.statusCode === 401) {
          clearTokens()
          reject(new Error('Token已过期或无效，请重新登录'))
        } else if (res.statusCode === 404) {
          reject(new Error('Dify应用不存在或未找到'))
        } else if (res.statusCode === 429) {
          reject(new Error('请求频率过高，请稍后重试'))
        } else if (res.statusCode === 502) {
          reject(new Error('Dify服务暂时不可用，请稍后重试'))
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
        console.error('Dify请求失败:', err)
        reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
      }
    })
  })
}

/**
 * Dify智能客服API调用（流式模式）
 * 注意：微信小程序可能不完全支持SSE流式响应，此函数使用阻塞模式模拟流式效果
 * @param query 用户问题（必填）
 * @param conversationId 对话ID（可选）
 * @param inputs 工作流输入变量（可选）
 * @param onDelta 接收到增量内容时的回调（可选）
 * @param onDone 接收完成时的回调（可选）
 * @param onError 发生错误时的回调（可选）
 * @returns Promise<any> 返回完整结果
 */
export const sendDifyMessageStream = async (
  query: string,
  conversationId?: string | null,
  inputs?: Record<string, any>,
  onDelta?: (data: { event: string, content: string, message_id?: string, conversation_id?: string }) => void,
  onDone?: (data: { event: string, message_id?: string, conversation_id?: string, usage?: any }) => void,
  onError?: (error: { event: string, detail: string }) => void
): Promise<any> => {
  // 微信小程序不支持真正的SSE流式响应，所以使用阻塞模式
  // 如果需要流式效果，可以在前端模拟打字机效果
  return sendDifyMessage(query, conversationId, inputs)
    .then((result) => {
      // 模拟流式效果：将完整答案逐字显示
      if (onDelta && result.answer) {
        const answer = result.answer
        let index = 0
        const interval = setInterval(() => {
          if (index < answer.length) {
            const chunk = answer.substring(index, Math.min(index + 3, answer.length))
            onDelta({
              event: 'delta',
              content: chunk,
              message_id: result.id,
              conversation_id: result.conversation_id
            })
            index += 3
          } else {
            clearInterval(interval)
            if (onDone) {
              onDone({
                event: 'done',
                message_id: result.id,
                conversation_id: result.conversation_id,
                usage: result.usage
              })
            }
          }
        }, 50) // 每50ms显示3个字符
      } else if (onDone) {
        onDone({
          event: 'done',
          message_id: result.id,
          conversation_id: result.conversation_id,
          usage: result.usage
        })
      }
      return result
    })
    .catch((error) => {
      if (onError) {
        onError({
          event: 'error',
          detail: error.message || '发送消息失败'
        })
      }
      throw error
    })
}

/**
 * 多图视频API调用
 * @param imagePaths 输入图片文件路径数组（至少1张，最多3张）
 * @param nFrames 帧数，150=5秒，300=10秒（必填，默认150）
 * @param prompt 视频描述提示词（5秒视频必填）
 * @param prompt1 第一个视频提示词（10秒视频必填，0-5秒）
 * @param prompt2 第二个视频提示词（10秒视频必填，5-10秒）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @param onProgress 进度回调函数，接收已等待的秒数（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateMultiImageToVideo = async (
  imagePaths: string[],
  nFrames: number = 150,
  prompt?: string,
  prompt1?: string,
  prompt2?: string,
  negativePrompt?: string,
  seed?: number,
  onProgress?: (elapsed: number) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    // 验证参数
    if (!imagePaths || imagePaths.length === 0) {
      reject(new Error('请至少选择一张图片'))
      return
    }

    if (nFrames === 300) {
      // 10秒视频需要两个提示词
      if (!prompt1 || !prompt2) {
        reject(new Error('10秒视频需要提供两个提示词（prompt1和prompt2）'))
        return
      }
    } else {
      // 5秒视频需要一个提示词
      if (!prompt) {
        reject(new Error('5秒视频需要提供提示词'))
        return
      }
    }

    const fs = wx.getFileSystemManager()

    console.log('多图视频：使用JSON格式发送base64数据', {
      imageCount: imagePaths.length,
      nFrames,
      promptLength: prompt?.length || 0,
      prompt1Length: prompt1?.length || 0,
      prompt2Length: prompt2?.length || 0,
      hasToken: !!accessToken
    })

    // 读取所有图片的base64数据
    const readImageAsBase64 = (filePath: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        fs.readFile({
          filePath: filePath,
          encoding: 'base64',
          success: (res) => {
            resolve(res.data)
          },
          fail: (err) => {
            reject(new Error(`读取文件失败: ${err.errMsg}`))
          }
        })
      })
    }

    // 读取所有图片
    Promise.all(imagePaths.map(path => readImageAsBase64(path)))
      .then((base64Images) => {
        // 构建请求数据（使用多图生成接口，添加视频参数）
        const requestData: any = {}

        // 添加图片base64数据
        base64Images.forEach((base64, index) => {
          if (base64) {
            requestData[`image${index + 1}_base64`] = base64
          }
        })

        // 多图生成接口需要 prompt 参数（图片合成提示词，必填）
        // 根据视频时长添加不同的提示词作为图片合成提示词
        let imagePrompt = ''
        if (nFrames === 300) {
          // 10秒视频：使用 prompt1 和 prompt2 组合作为图片合成提示词
          if (prompt1 && prompt2) {
            imagePrompt = `${prompt1}; ${prompt2}`
          } else if (prompt1) {
            imagePrompt = prompt1
          } else if (prompt2) {
            imagePrompt = prompt2
          }
        } else {
          // 5秒视频
          if (prompt) {
            imagePrompt = prompt
          }
        }
        
        if (imagePrompt) {
          requestData['prompt'] = imagePrompt
        }

        // 视频相关参数（使用多图生成接口的视频参数）
        requestData['generate_video'] = true // 启用视频生成
        requestData['n_frames'] = nFrames.toString() // 帧数
        
        // 视频提示词（video_prompt）
        if (nFrames === 300) {
          // 10秒视频：使用 prompt1 和 prompt2 组合作为视频提示词
          if (prompt1 && prompt2) {
            requestData['video_prompt'] = `${prompt1}; ${prompt2}`
          } else if (prompt1) {
            requestData['video_prompt'] = prompt1
          } else if (prompt2) {
            requestData['video_prompt'] = prompt2
          }
        } else {
          // 5秒视频
          if (prompt) {
            requestData['video_prompt'] = prompt
          }
        }

        // 选填参数
        if (negativePrompt) {
          requestData['negative_prompt'] = negativePrompt
        }
        if (seed !== undefined && seed !== null) {
          requestData['seed'] = seed.toString()
        }

        console.log('多图视频请求参数:', {
          generate_video: requestData['generate_video'],
          n_frames: requestData['n_frames'],
          imageCount: base64Images.filter(b => b).length,
          hasPrompt: !!requestData['prompt'],
          hasVideoPrompt: !!requestData['video_prompt'],
          hasNegativePrompt: !!requestData['negative_prompt'],
          hasSeed: requestData['seed'] !== undefined
        })

        // 发送请求（使用多图生成接口，添加视频参数）
        // 用于存储从响应头中提取的 prompt_id
        let promptIdFromHeader: string | null = null
        
        const requestTask = wx.request({
          url: `${API_BASE}/chat/images/multi-generate`,
          method: 'POST',
          header: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          data: requestData,
          timeout: 1800000, // 30分钟超时（延长等待时间）
          success: (res) => {
            console.log('多图视频响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)

            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                console.log('多图视频解析后的响应数据:', {
                  hasPromptId: !!data.prompt_id,
                  videosCount: data.videos?.length || 0,
                  imagesCount: data.images?.length || 0,
                  cost: data.cost,
                  balance: data.balance
                })
                
                // 检查是否返回了 prompt_id（需要轮询）
                if (data.prompt_id) {
                  // 检查是否已经包含 videos（后端可能已经直接返回结果）
                  // 即使videos数组为空，如果其他字段表明任务已完成，也不应该轮询
                  const hasVideos = data.videos && Array.isArray(data.videos) && data.videos.length > 0
                  const hasImages = data.images && Array.isArray(data.images) && data.images.length > 0
                  const hasResult = hasVideos || hasImages || data.status === 'completed' || data.status === 'success'
                  
                  if (hasResult) {
                    console.log('多图视频：检测到 prompt_id 但已包含结果，直接返回（不轮询）', {
                      hasVideos,
                      hasImages,
                      status: data.status
                    })
                    resolve(data)
                  } else {
                    console.log('多图视频：检测到 prompt_id，开始轮询任务状态...')
                    // 保存初始响应数据，如果轮询失败可以返回它
                    const initialData = data
                    // 使用轮询机制获取结果
                    const startTime = Date.now()
                    const pollInterval = 3000 // 每3秒轮询一次
                    const maxWaitTime = 1800 // 30分钟超时（延长等待时间）
                    
                    const poll = () => {
                      const elapsed = (Date.now() - startTime) / 1000
                      
                      // 调用进度回调
                      if (onProgress) {
                        onProgress(Math.round(elapsed))
                      }
                      
                      if (elapsed > maxWaitTime) {
                        reject(new Error(`任务超时：超过最大等待时间（${Math.round(maxWaitTime)}秒）`))
                        return
                      }
                      
                      // 查询任务状态
                      wx.request({
                        url: `${API_BASE}/chat/images/multi-generate/status/${data.prompt_id}`,
                        method: 'GET',
                        header: {
                          'Authorization': `Bearer ${accessToken}`
                        },
                        timeout: 30000,
                        success: (res) => {
                          if (res.statusCode === 200 || res.statusCode === 201) {
                            try {
                              const pollData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                              
                              // 检查任务状态
                              if (pollData.status === 'completed' || pollData.status === 'success') {
                                console.log('✅ 多图视频任务完成！耗时:', Math.round(elapsed), '秒')
                                resolve(pollData)
                              } else if (pollData.status === 'failed' || pollData.status === 'error') {
                                reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                              } else {
                                // 任务还在执行中，继续轮询
                                console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                                setTimeout(poll, pollInterval)
                              }
                            } catch (e) {
                              // 如果解析失败，可能是任务还在执行中
                              console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                              setTimeout(poll, pollInterval)
                            }
                          } else if (res.statusCode === 404) {
                            // 404 可能表示接口不存在
                            // 如果已经等待超过30秒，可能是接口不存在，直接返回初始响应
                            if (elapsed > 30) {
                              console.warn('多图视频：轮询接口404超过30秒，可能接口不存在。返回初始响应数据。')
                              console.log('初始响应数据:', initialData)
                              // 直接返回初始响应，让页面处理（可能已经包含结果）
                              resolve(initialData)
                            } else {
                              console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                              setTimeout(poll, pollInterval)
                            }
                          } else {
                            reject(new Error(`查询任务状态失败: ${res.statusCode}`))
                          }
                        },
                        fail: (err) => {
                          // 如果是404（任务还未完成），继续轮询
                          if (err.errMsg && err.errMsg.includes('404')) {
                            // 如果已经等待超过30秒，可能是接口不存在，直接返回初始响应
                            if (elapsed > 30) {
                              console.warn('多图视频：轮询接口404超过30秒，可能接口不存在。返回初始响应数据。')
                              console.log('初始响应数据:', initialData)
                              resolve(initialData)
                            } else {
                              console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                              setTimeout(poll, pollInterval)
                            }
                          } else {
                            reject(new Error(`网络错误: ${err.errMsg || '查询任务状态失败'}`))
                          }
                        }
                      })
                    }
                    
                    // 开始轮询
                    poll()
                  }
                } else {
                  // 直接返回结果
                  resolve(data)
                }
              } catch (e) {
                console.error('多图视频响应解析失败:', e, res.data)
                reject(new Error('响应解析失败，请检查后端返回格式'))
              }
            } else if (res.statusCode === 401) {
              clearTokens()
              reject(new Error('Token已过期或无效，请重新登录'))
            } else if (res.statusCode === 402) {
              reject(new Error('星星余额不足，请充值'))
            } else if (res.statusCode === 500) {
              // 500 内部服务器错误，可能是响应数据过大导致
              // 尝试从响应头或响应体中提取 prompt_id
              let promptId: string | null = promptIdFromHeader
              
              // 如果响应头中没有，尝试从响应体中提取
              if (!promptId && typeof res.data === 'string') {
                try {
                  const promptIdMatch = res.data.match(/["']prompt_id["']\s*:\s*["']([^"']+)["']/)
                  if (promptIdMatch) {
                    promptId = promptIdMatch[1]
                  }
                } catch (e) {
                  console.error('多图视频：从响应体提取 prompt_id 失败:', e)
                }
              }
              
              if (promptId) {
                // 如果有 prompt_id，开始轮询
                console.log('多图视频：500错误但检测到 prompt_id，开始轮询...', promptId)
                const startTime = Date.now()
                const pollInterval = 3000
                const maxWaitTime = 1200
                
                const poll = () => {
                  const elapsed = (Date.now() - startTime) / 1000
                  if (onProgress) {
                    onProgress(Math.round(elapsed))
                  }
                  if (elapsed > maxWaitTime) {
                    reject(new Error(`任务超时：超过最大等待时间（${Math.round(maxWaitTime)}秒）`))
                    return
                  }
                  
                  wx.request({
                    url: `${API_BASE}/chat/images/multi-generate/status/${promptId}`,
                    method: 'GET',
                    header: {
                      'Authorization': `Bearer ${accessToken}`
                    },
                    timeout: 30000,
                    success: (pollRes) => {
                      if (pollRes.statusCode === 200 || pollRes.statusCode === 201) {
                        try {
                          const pollData = typeof pollRes.data === 'string' ? JSON.parse(pollRes.data) : pollRes.data
                          if (pollData.status === 'completed' || pollData.status === 'success') {
                            console.log('✅ 多图视频任务完成！耗时:', Math.round(elapsed), '秒')
                            resolve(pollData)
                          } else if (pollData.status === 'failed' || pollData.status === 'error') {
                            reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                          } else {
                            console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                            setTimeout(poll, pollInterval)
                          }
                        } catch (e) {
                          console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else if (pollRes.statusCode === 404) {
                        if (elapsed > 30) {
                          reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                        } else {
                          console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else {
                        reject(new Error(`查询任务状态失败: ${pollRes.statusCode}`))
                      }
                    },
                    fail: (err) => {
                      if (err.errMsg && err.errMsg.includes('404')) {
                        if (elapsed > 30) {
                          reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                        } else {
                          console.log(`⏳ 多图视频任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else {
                        reject(new Error(`网络错误: ${err.errMsg || '查询任务状态失败'}`))
                      }
                    }
                  })
                }
                poll()
              } else {
                // 没有 prompt_id，立即重试（保持loading状态）
                console.warn('多图视频：500错误且未找到 prompt_id，立即重试...')
                
                // 立即重试，每5秒重试一次，最多重试60次（5分钟）
                const retryRequest = (retryCount: number = 0) => {
                  const maxRetries = 60 // 最多重试60次（约5分钟，每次间隔5秒）
                  if (retryCount >= maxRetries) {
                    reject(new Error('服务器处理时间过长，请稍后手动重试'))
                    return
                  }
                  
                  console.log(`多图视频：第${retryCount + 1}次重试（收到500错误）...`)
                  
                  // 如果onProgress回调存在，更新进度提示
                  if (onProgress) {
                    const elapsed = retryCount * 5 // 每次重试间隔5秒
                    onProgress(elapsed)
                  }
                  
                  wx.request({
                    url: `${API_BASE}/chat/images/multi-generate`,
                    method: 'POST',
                    header: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    },
                    data: requestData,
                    timeout: 1800000,
                    success: (retryRes) => {
                      // 递归处理响应（调用相同的处理逻辑）
                      if (retryRes.statusCode === 200 || retryRes.statusCode === 201) {
                        try {
                          const data = typeof retryRes.data === 'string' ? JSON.parse(retryRes.data) : retryRes.data
                          resolve(data)
                        } catch (e) {
                          resolve(retryRes.data)
                        }
                      } else if (retryRes.statusCode === 500) {
                        // 如果还是500，继续重试
                        console.warn(`多图视频：重试后仍收到500错误，${5}秒后继续重试...`)
                        setTimeout(() => retryRequest(retryCount + 1), 5000) // 5秒后重试
                      } else {
                        let errorMsg = `请求失败: ${retryRes.statusCode}`
                        try {
                          const errorData = typeof retryRes.data === 'string' ? JSON.parse(retryRes.data) : retryRes.data
                          errorMsg = errorData.detail || errorData.message || errorMsg
                        } catch (e) {
                          errorMsg = typeof retryRes.data === 'string' ? retryRes.data : JSON.stringify(retryRes.data) || errorMsg
                        }
                        reject(new Error(errorMsg))
                      }
                    },
                    fail: (err) => {
                      // 网络错误也重试
                      console.warn(`多图视频：网络错误，${5}秒后继续重试...`)
                      setTimeout(() => retryRequest(retryCount + 1), 5000) // 5秒后重试
                    }
                  })
                }
                
                // 立即开始第一次重试
                setTimeout(() => retryRequest(0), 5000) // 5秒后开始第一次重试
              }
            } else if (res.statusCode === 502) {
              reject(new Error('ComfyUI服务错误，请稍后重试'))
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
            console.error('多图视频请求失败:', err)
            reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
          }
        })
        
        // 监听响应头，尝试提取 prompt_id（即使响应体解析失败）
        requestTask.onHeadersReceived((res) => {
          try {
            const headers = res.header || {}
            promptIdFromHeader = headers['prompt_id'] || headers['Prompt-Id'] || headers['X-Prompt-Id'] || null
            if (promptIdFromHeader) {
              console.log('多图视频：从响应头中提取到 prompt_id:', promptIdFromHeader)
            }
          } catch (e) {
            console.error('多图视频：提取响应头失败:', e)
          }
        })
      })
      .catch((error) => {
        console.error('多图视频：读取图片文件失败:', error)
        reject(error)
      })
  })
}

/**
 * 九宫格图API调用
 * @param imagePath 输入图片文件路径（必填）
 * @param prompt 提示词（必填）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @returns Promise<any> 返回API响应结果（包含多张图片数组）
 */
export const generateGridImage = async (
  imagePath: string,
  prompt: string,
  negativePrompt?: string,
  seed?: number
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    const fs = wx.getFileSystemManager()

    console.log('九宫格图：使用multipart/form-data格式上传图片', {
      imagePath,
      promptLength: prompt?.length || 0,
      hasToken: !!accessToken
    })

    // 先检查文件信息，确保文件存在且有效（兼容真机和开发工具）
    fs.getFileInfo({
      filePath: imagePath,
      success: (info) => {
        const sizeKB = Math.round(info.size / 1024)
        console.log('九宫格图图片文件信息:', { 
          size: info.size, 
          sizeKB: sizeKB,
          path: imagePath,
          isValid: info.size > 0
        })
        
        if (info.size === 0) {
          reject(new Error('图片文件为空，请重新选择图片'))
          return
        }
        
        // 验证文件路径格式（确保在真机上也能正常工作）
        if (!imagePath || typeof imagePath !== 'string') {
          reject(new Error('图片路径无效，请重新选择图片'))
          return
        }
        
        // 如果文件太大，给出警告
        if (sizeKB > 10240) { // 10MB
          console.warn('九宫格图：图片文件较大（' + sizeKB + 'KB），可能导致上传超时或连接中断')
        }
        
        // 构建formData（严格按照API文档要求）
        const formData: any = {
          'prompt': prompt, // 必填：提示词
          'workflow_type': 'grid-image' // 必填：必须设置为 'grid-image'
        }
        
        // 选填参数
        if (negativePrompt) {
          formData['negative_prompt'] = negativePrompt
        }
        if (seed !== undefined && seed !== null) {
          formData['seed'] = seed.toString()
        }
        
        console.log('九宫格图请求参数:', {
          workflow_type: formData['workflow_type'],
          prompt: formData['prompt'],
          hasNegativePrompt: !!formData['negative_prompt'],
          hasSeed: formData['seed'] !== undefined
        })

        const parseUploadSuccess = (res: WechatMiniprogram.UploadFileSuccessCallbackResult) => {
          console.log('九宫格图响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)

          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
              console.log('九宫格图解析后的响应数据:', {
                hasPromptId: !!data.prompt_id,
                imagesCount: data.images?.length || 0,
                cost: data.cost,
                balance: data.balance
              })
              
              // 验证返回格式（按照API文档）
              if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
                console.warn('九宫格图返回数据格式异常:', data)
                reject(new Error('返回数据格式异常：未找到图片数组'))
                return
              }
              
              resolve(data)
            } catch (e) {
              console.error('九宫格图响应解析失败:', e, res.data)
              reject(new Error('响应解析失败，请检查后端返回格式'))
            }
            return
          }

          if (res.statusCode === 401) {
            // Token过期，尝试使用refresh token刷新
            console.warn('九宫格图：Token过期（401），尝试使用refresh token刷新...')
            refreshAccessToken()
              .then((newToken) => {
                console.log('Token刷新成功，使用新token重试上传...')
                currentToken = newToken // 更新当前token
                retryCount = 0 // 重置重试计数
                attemptUpload() // 使用新token重新上传
              })
              .catch((refreshError) => {
                console.error('Token刷新失败:', refreshError)
                clearTokens()
                reject(new Error('Token已过期且刷新失败，请重新登录'))
              })
            return
          }

          if (res.statusCode === 500) {
            // 500错误：服务器内部错误，可能是后台正在处理
            if (retryCount < maxRetries) {
              retryCount++
              console.warn(`九宫格图：收到500错误，10秒后重试（第${retryCount}/${maxRetries}次）...`)
              
              // 延迟重试，给服务器一点时间
              setTimeout(() => {
                console.log('九宫格图：开始重试（收到500错误）...')
                attemptUpload() // 重试请求
              }, 10000) // 10秒后重试
            } else {
              // 超过最大重试次数，直接报错
              console.error('九宫格图：500错误重试次数已达上限，停止重试')
              let errorMsg = '服务器内部错误(500)，请稍后重试'
              try {
                const errorData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                errorMsg = errorData.detail || errorData.message || errorMsg
              } catch (e) {
                errorMsg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data) || errorMsg
              }
              reject(new Error(errorMsg))
            }
            return
          }

          let errorMsg = `请求失败: ${res.statusCode}`
          try {
            const errorData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            // 处理不同的错误格式
            if (errorData.detail) {
              errorMsg = errorData.detail
            } else if (errorData.message) {
              errorMsg = errorData.message
            } else if (errorData.non_field_errors && Array.isArray(errorData.non_field_errors)) {
              errorMsg = errorData.non_field_errors.join('; ')
            } else if (typeof errorData === 'string') {
              errorMsg = errorData
            }
          } catch (e) {
            if (typeof res.data === 'string') {
              if (res.data.includes('Internal Server Error')) {
                errorMsg = '服务器内部错误(500)，可能是请求格式问题。请检查后端日志。'
              } else {
                errorMsg = res.data
              }
            }
          }

          console.error('九宫格图请求失败:', errorMsg)
          reject(new Error(errorMsg))
        }

        // 使用 image 字段名上传（严格按照API文档要求：formData.append('image', imageFile)）
        let retryCount = 0
        const maxRetries = 10 // 最多重试10次（500错误重试）
        let currentToken = accessToken // 使用变量存储当前token，以便刷新后更新
        
        const attemptUpload = () => {
          // 每次上传前获取最新的token（可能已刷新）
          const token = getAccessToken() || currentToken
          currentToken = token
          
          console.log('九宫格图开始上传:', { 
            url: `${API_BASE}/chat/images/generate`, 
            fileFieldName: 'image',
            workflowType: 'grid-image',
            hasImage: !!imagePath,
            hasToken: !!token,
            attempt: retryCount + 1,
            maxRetries: maxRetries + 1
          })
          
          wx.uploadFile({
            url: `${API_BASE}/chat/images/generate`,
            filePath: imagePath,
            name: 'image', // 严格按照API文档：formData.append('image', imageFile)
            formData: formData,
            header: {
              'Authorization': `Bearer ${token}` // 使用最新的token
            },
            timeout: 600000, // 10分钟超时
            success: parseUploadSuccess,
            fail: (err) => {
              console.error(`九宫格图上传失败(第${retryCount + 1}次尝试):`, err)
              const msg = err.errMsg || ''
              
              // 如果是连接被中断（aborted/ECONNRESET/socket hang up），可能是网络问题或后端处理时间过长
              // 尝试重试一次，但不要无限重试
              const isConnError = msg.includes('aborted') || msg.includes('ECONNRESET') || msg.includes('socket hang up')
              
              if (isConnError && retryCount < maxRetries) {
                retryCount++
                // 重试等待时间：第1次重试等待10分钟，第2次重试等待10分钟（给后端足够时间处理并返回结果）
                const waitSeconds = 600 // 10分钟 = 600秒
                const waitMinutes = waitSeconds / 60
                console.warn(`九宫格图连接中断，${waitMinutes}分钟后重试（第${retryCount + 1}次/${maxRetries + 1}次）...`)
                console.warn('提示：如果后台已生成结果，重试时应该能成功获取。如果后台未生成，请检查服务器日志。')
                
                // 显示等待提示
                wx.showToast({
                  title: `${waitMinutes}分钟后自动重试`,
                  icon: 'none',
                  duration: 2000
                })
                
                // 等待后重试（给后端足够时间处理并返回结果）
                setTimeout(() => {
                  console.log(`九宫格图：等待${waitMinutes}分钟后开始第${retryCount + 1}次重试...`)
                  attemptUpload()
                }, waitSeconds * 1000)
                return
              }
              
              // 如果已经重试过或不是连接错误，直接报错
              if (isConnError) {
                reject(new Error('上传失败：连接多次被中断。\n\n可能原因：\n1. 后端处理时间过长，连接被提前关闭\n2. 网络不稳定或网关配置问题\n3. 后端已处理请求但连接被断开\n\n建议：\n1. 检查后台是否已生成结果（如果已生成，结果可能已保存）\n2. 如果后台已生成，可以稍后手动刷新查看\n3. 如果后台未生成，联系后端排查服务器配置和日志\n4. 建议后端优化：处理完成后保持连接，或提供查询接口'))
              } else if (msg.includes('timeout')) {
                reject(new Error('上传超时：服务器长时间无响应，请稍后重试或联系后端排查。'))
              } else {
                reject(new Error(`网络错误: ${msg || '请求失败'}`))
              }
            }
          })
        }
        
        // 开始第一次上传尝试
        attemptUpload()
      },
      fail: (e) => {
        console.error('九宫格图获取文件信息失败:', e)
        // 文件不存在或无法访问，直接报错
        reject(new Error('图片文件无法访问，请重新选择图片'))
        return
      }
    })
  })
}

/**
 * 尝试使用multipart/form-data格式（通过wx.uploadFile）
 */
function tryMultipartFormData(
  prompt: string,
  accessToken: string,
  negativePrompt: string | undefined,
  seed: number | undefined,
  workflowType: string = 'text-to-image',
  resolve: (value: any) => void,
  reject: (reason?: any) => void
) {
  let currentToken = accessToken // 使用变量存储当前token，以便刷新后更新
  let retryCount = 0 // 重试计数器
  const maxRetries = 10 // 最大重试次数（AI模特最多重试10次）
  const fs = wx.getFileSystemManager()
  
  // 获取用户数据目录（微信小程序标准路径）
  // 确保使用绝对路径，兼容真机和开发工具
  const getFilePath = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        // 方法1：使用 wx.env.USER_DATA_PATH（推荐）
        if (wx.env && wx.env.USER_DATA_PATH) {
          const userDataPath = wx.env.USER_DATA_PATH
          const normalizedPath = userDataPath.endsWith('/') 
            ? userDataPath 
            : `${userDataPath}/`
          const filePath = `${normalizedPath}temp_upload_${Date.now()}.txt`
          console.log('使用 USER_DATA_PATH 生成文件路径:', filePath)
          resolve(filePath)
          return
        }
        
        // 方法2：尝试通过写入文件来获取可用路径（真机兼容）
        // 先尝试写入一个测试文件，如果成功则使用该路径
        const testPath = `temp_test_${Date.now()}.txt`
        fs.writeFile({
          filePath: testPath,
          data: 'test',
          encoding: 'utf8',
          success: () => {
            // 测试成功，删除测试文件，使用相同目录
            try {
              fs.unlinkSync(testPath)
            } catch (e) {
              // 忽略删除错误
            }
            // 使用相对路径（微信小程序会自动处理）
            const filePath = `temp_upload_${Date.now()}.txt`
            console.log('使用相对路径生成文件路径:', filePath)
            resolve(filePath)
          },
          fail: (err) => {
            console.error('测试文件路径失败:', err)
            // 最后的备用方案：使用固定路径
            const filePath = `temp_upload_${Date.now()}.txt`
            console.warn('使用备用路径:', filePath)
            resolve(filePath)
          }
        })
      } catch (e) {
        console.error('获取文件路径异常:', e)
        // 最后的备用方案
        resolve(`temp_upload_${Date.now()}.txt`)
      }
    })
  }
  
  const attemptRequest = () => {
    // 每次请求前获取最新的token（可能已刷新）
    const token = getAccessToken() || currentToken
    currentToken = token
    
    console.log('尝试使用multipart/form-data格式')
    
    // 异步获取文件路径（兼容真机和开发工具）
    getFilePath().then((filePath) => {
      console.log('获取到文件路径:', filePath)
      
      // 先尝试删除可能存在的旧文件（避免存储空间问题）
      try {
        fs.unlinkSync(filePath)
      } catch (e) {
        // 文件不存在，忽略错误
      }
      
      // 创建一个小的占位文件（wx.uploadFile需要文件，但我们不使用它）
      fs.writeFile({
        filePath: filePath,
        data: '', // 空文件，只是占位符
        encoding: 'utf8',
        success: () => {
          console.log('临时文件创建成功:', filePath)
        // 构建formData，prompt作为文本字段（这是关键）
        const formData: any = {
          'prompt': prompt, // prompt作为文本字段，不是文件
          'workflow_type': workflowType
        }
        if (negativePrompt) {
          formData['negative_prompt'] = negativePrompt
        }
        if (seed !== undefined) {
          formData['seed'] = seed.toString()
        }

        console.log('发送multipart/form-data请求:', {
          url: `${API_BASE}/chat/images/generate`,
          formData,
          promptInFormData: formData.prompt,
          hasToken: !!token,
          tokenLength: token.length
        })

        // 使用wx.uploadFile发送FormData
        // 注意：使用'file'作为文件字段名，避免与formData中的'prompt'冲突
        // prompt在formData中作为文本字段传递
        wx.uploadFile({
          url: `${API_BASE}/chat/images/generate`,
          filePath: filePath,
          name: 'file', // 使用不相关的文件字段名，避免覆盖formData中的prompt
          formData: formData, // prompt在这里作为文本字段
          header: {
            'Authorization': `Bearer ${token}` // 使用最新的token
          },
        timeout: 600000, // 10分钟超时（600秒 = 600000毫秒）
        success: (res) => {
          // 清理临时文件
          try {
            fs.unlinkSync(filePath)
          } catch (e) {
            console.warn('清理临时文件失败:', e)
          }
          
          console.log('multipart/form-data响应:', res.statusCode, res.data)
          
          // 200和201都表示成功
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const data = JSON.parse(res.data)
              console.log('解析后的响应数据:', data)
              resolve(data)
            } catch (e) {
              console.log('响应不是JSON格式，直接返回:', res.data)
              resolve(res.data)
            }
          } else if (res.statusCode === 401) {
            // Token过期，尝试使用refresh token刷新
            console.warn('multipart/form-data：Token过期（401），尝试使用refresh token刷新...')
            refreshAccessToken()
              .then((newToken) => {
                console.log('Token刷新成功，使用新token重试请求...')
                currentToken = newToken // 更新当前token
                attemptRequest() // 使用新token重新请求
              })
              .catch((refreshError) => {
                console.error('Token刷新失败:', refreshError)
                clearTokens()
                let errorMsg = 'Token已过期且刷新失败，请重新登录'
                try {
                  const errorData = JSON.parse(res.data)
                  if (errorData.detail) {
                    errorMsg = errorData.detail
                  } else if (errorData.message) {
                    errorMsg = errorData.message
                  }
                } catch (e) {
                  // 忽略解析错误
                }
                reject(new Error(errorMsg))
              })
          } else if (res.statusCode === 500) {
            // 500错误：服务器内部错误，可能是后台正在处理
            if (retryCount < maxRetries) {
              retryCount++
              console.warn(`multipart/form-data：收到500错误，10秒后重试（第${retryCount}/${maxRetries}次）...`)
              
              // 延迟重试，给服务器一点时间
              setTimeout(() => {
                console.log('multipart/form-data：开始重试（收到500错误）...')
                attemptRequest() // 重试请求
              }, 10000) // 10秒后重试
            } else {
              // 超过最大重试次数，直接报错
              console.error('multipart/form-data：500错误重试次数已达上限，停止重试')
              let errorMsg = '服务器内部错误(500)，请稍后重试'
              try {
                const errorData = JSON.parse(res.data)
                errorMsg = errorData.detail || errorData.message || errorMsg
              } catch (e) {
                errorMsg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data) || errorMsg
              }
              reject(new Error(errorMsg))
            }
          } else {
            let errorMsg = `请求失败: ${res.statusCode}`
            try {
              const errorData = JSON.parse(res.data)
              errorMsg = errorData.detail || errorData.message || errorMsg
            } catch (e) {
              errorMsg = res.data || errorMsg
            }
            console.error('multipart/form-data请求失败:', errorMsg)
            reject(new Error(errorMsg))
          }
        },
        fail: (err) => {
          // 清理临时文件
          try {
            fs.unlinkSync(filePath)
          } catch (e) {
            console.warn('清理临时文件失败:', e)
          }
          reject(new Error(`网络错误: ${err.errMsg || '请求失败'}`))
        }
      })
      },
      fail: (err) => {
        console.error('创建临时文件失败:', err, { filePath, userDataPath: wx.env?.USER_DATA_PATH })
        // 如果创建文件失败，可能是存储空间不足或路径无效
        let errorMsg = `创建临时文件失败: ${err.errMsg || '未知错误'}`
        if (err.errMsg && err.errMsg.includes('maximum size')) {
          errorMsg = '存储空间不足。\n\n请清理小程序缓存：\n1. 打开微信设置\n2. 找到小程序\n3. 清除缓存和数据\n4. 重新打开小程序'
        } else if (err.errMsg && err.errMsg.includes('invalid') || err.errMsg && err.errMsg.includes('file path')) {
          errorMsg = `文件路径无效: ${filePath}\n\n可能原因：\n1. 小程序存储权限未授权\n2. 文件系统路径配置问题\n\n请尝试：\n1. 重新打开小程序\n2. 检查小程序存储权限\n3. 清除小程序缓存后重试`
        }
        reject(new Error(errorMsg))
      }
    })
    }).catch((err) => {
      console.error('获取文件路径失败:', err)
      reject(new Error(`无法创建临时文件: ${err.message || '未知错误'}`))
    })
  }
  
  // 开始第一次请求尝试
  attemptRequest()
}

/**
 * 尝试使用application/x-www-form-urlencoded格式
 */
function tryFormUrlencoded(
  prompt: string, 
  accessToken: string, 
  resolve: (value: any) => void, 
  reject: (reason?: any) => void,
  negativePrompt?: string,
  seed?: number
) {
  let formData = `prompt=${encodeURIComponent(prompt)}&workflow_type=text-to-image`
  if (negativePrompt) {
    formData += `&negative_prompt=${encodeURIComponent(negativePrompt)}`
  }
  if (seed !== undefined) {
    formData += `&seed=${seed}`
  }
  
  wx.request({
    url: `${API_BASE}/chat/images/generate`,
    method: 'POST',
    header: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    data: formData,
    success: (res) => {
      if (res.statusCode === 200) {
        resolve(res.data)
      } else {
        reject(new Error(`请求失败: ${res.statusCode}, ${JSON.stringify(res.data)}`))
      }
    },
    fail: (err) => {
      reject(err)
    }
  })
}

/**
 * 使用wx.uploadFile方式发送multipart/form-data格式
 * 注意：此方法需要创建一个临时文件，仅在后端严格要求FormData时使用
 * @param prompt 提示词
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @returns Promise<any>
 */
export const generateImageWithUpload = async (
  prompt: string, 
  negativePrompt?: string, 
  seed?: number
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录'))
      return
    }

    // 将prompt写入临时文件（因为wx.uploadFile需要文件）
    const fs = wx.getFileSystemManager()
    // 使用临时文件路径（小程序环境下的用户数据目录）
    let filePath: string
    try {
      const userDataPath = wx.env?.USER_DATA_PATH
      if (userDataPath) {
        const normalizedPath = userDataPath.endsWith('/') ? userDataPath : `${userDataPath}/`
        filePath = `${normalizedPath}temp_prompt_${Date.now()}.txt`
      } else {
        filePath = `temp_prompt_${Date.now()}.txt`
      }
      console.log('生成临时文件路径:', filePath)
    } catch (e) {
      console.error('获取文件路径失败:', e)
      filePath = `temp_prompt_${Date.now()}.txt`
    }
    
    fs.writeFile({
      filePath: filePath,
      data: prompt,
      encoding: 'utf8',
      success: () => {
        // 使用wx.uploadFile发送FormData
        wx.uploadFile({
          url: `${API_BASE}/chat/images/generate`,
          filePath: filePath,
          name: 'prompt',
          formData: {
            'workflow_type': 'text-to-image',
            ...(negativePrompt && { 'negative_prompt': negativePrompt }),
            ...(seed !== undefined && { 'seed': seed.toString() })
          },
          header: {
            'Authorization': `Bearer ${accessToken}`
          },
          success: (res) => {
            // 清理临时文件
            fs.unlinkSync(filePath)
            
            if (res.statusCode === 200) {
              try {
                const data = JSON.parse(res.data)
                resolve(data)
              } catch (e) {
                resolve(res.data)
              }
            } else {
              reject(new Error(`请求失败: ${res.statusCode}`))
            }
          },
          fail: (err) => {
            // 清理临时文件
            try {
              fs.unlinkSync(filePath)
            } catch (e) {
              // 忽略清理错误
            }
            reject(err)
          }
        })
      },
      fail: (err) => {
        reject(new Error(`创建临时文件失败: ${err.errMsg}`))
      }
    })
  })
}

