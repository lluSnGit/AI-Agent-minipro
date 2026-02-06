import { API_BASE, getAccessToken, clearTokens } from './api'

/**
 * 多图生成API调用
 * @param image1Path 图1文件路径（必填）
 * @param image2Path 图2文件路径（必填）
 * @param image3Path 图3文件路径（必填）
 * @param prompt 图片合成提示词（必填）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @param generateVideo 是否生成视频（可选，默认false）
 * @param videoPrompt 视频生成提示词（生成视频时可选）
 * @param onProgress 进度回调函数，接收已等待的秒数（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateMultiImage = async (
  image1Path: string,
  image2Path: string,
  image3Path: string,
  prompt: string,
  negativePrompt?: string,
  seed?: number,
  generateVideo: boolean = false,
  videoPrompt?: string,
  onProgress?: (elapsed: number) => void
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const accessToken = getAccessToken()
    
    if (!accessToken) {
      reject(new Error('未找到access token，请先登录或输入Token'))
      return
    }

    // 验证参数
    if (!image1Path || !image2Path || !image3Path) {
      reject(new Error('请选择三张图片（图1、图2、图3都是必填）'))
      return
    }

    if (!prompt || !prompt.trim()) {
      reject(new Error('请输入合成提示词'))
      return
    }

    if (generateVideo && !videoPrompt?.trim()) {
      reject(new Error('生成视频时需要填写视频提示词'))
      return
    }

    const fs = wx.getFileSystemManager()

    console.log('多图生成：使用JSON格式发送base64数据', {
      hasImage1: !!image1Path,
      hasImage2: !!image2Path,
      hasImage3: !!image3Path,
      promptLength: prompt.length,
      generateVideo,
      videoPromptLength: videoPrompt?.length || 0,
      hasToken: !!accessToken
    })

    // 读取所有图片的base64数据
    const readImageAsBase64 = (filePath: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        fs.readFile({
          filePath: filePath,
          encoding: 'base64',
          success: (res) => {
            // base64编码时，data是string类型
            resolve(res.data as string)
          },
          fail: (err) => {
            reject(new Error(`读取文件失败: ${err.errMsg}`))
          }
        })
      })
    }

    // 读取所有图片
    Promise.all([
      readImageAsBase64(image1Path),
      readImageAsBase64(image2Path),
      readImageAsBase64(image3Path)
    ])
      .then(([base64Image1, base64Image2, base64Image3]) => {
        // 构建请求数据
        const requestData: any = {
          image1_base64: base64Image1,
          image2_base64: base64Image2,
          image3_base64: base64Image3,
          prompt: prompt.trim()
        }

        // 视频相关参数（可选）
        if (generateVideo) {
          requestData['generate_video'] = true
          if (videoPrompt?.trim()) {
            requestData['video_prompt'] = videoPrompt.trim()
          }
        }

        // 选填参数
        if (negativePrompt?.trim()) {
          requestData['negative_prompt'] = negativePrompt.trim()
        }
        if (seed !== undefined && seed !== null) {
          requestData['seed'] = seed.toString()
        }

        console.log('多图生成请求参数:', {
          generate_video: requestData['generate_video'] || false,
          imageCount: 3,
          hasPrompt: !!requestData['prompt'],
          hasVideoPrompt: !!requestData['video_prompt'],
          hasNegativePrompt: !!requestData['negative_prompt'],
          hasSeed: requestData['seed'] !== undefined
        })

        // 发送请求
        // 用于存储从响应头中提取的 prompt_id
        let promptIdFromHeader: string | null = null
        
        wx.request({
          url: `${API_BASE}/chat/images/multi-generate`,
          method: 'POST',
          header: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          data: requestData,
          timeout: 1800000, // 30分钟超时
          success: (res) => {
            console.log('多图生成响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)

            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                console.log('多图生成解析后的响应数据:', {
                  hasPromptId: !!data.prompt_id,
                  videosCount: data.videos?.length || 0,
                  imagesCount: data.images?.length || 0,
                  cost: data.cost,
                  balance: data.balance
                })
                
                // 检查是否返回了 prompt_id（需要轮询）
                if (data.prompt_id) {
                  // 检查是否已经包含结果
                  const hasVideos = data.videos && Array.isArray(data.videos) && data.videos.length > 0
                  const hasImages = data.images && Array.isArray(data.images) && data.images.length > 0
                  const hasResult = hasVideos || hasImages || data.status === 'completed' || data.status === 'success'
                  
                  if (hasResult) {
                    console.log('多图生成：检测到 prompt_id 但已包含结果，直接返回（不轮询）', {
                      hasVideos,
                      hasImages,
                      status: data.status
                    })
                    resolve(data)
                  } else {
                    console.log('多图生成：检测到 prompt_id，开始轮询任务状态...')
                    // 保存初始响应数据，如果轮询失败可以返回它
                    const initialData = data
                    // 使用轮询机制获取结果
                    const startTime = Date.now()
                    const pollInterval = 3000 // 每3秒轮询一次
                    const maxWaitTime = 1800 // 30分钟超时
                    
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
                                console.log('✅ 多图生成任务完成！耗时:', Math.round(elapsed), '秒')
                                resolve(pollData)
                              } else if (pollData.status === 'failed' || pollData.status === 'error') {
                                reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                              } else {
                                // 任务还在执行中，继续轮询
                                console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                                setTimeout(poll, pollInterval)
                              }
                            } catch (e) {
                              // 如果解析失败，可能是任务还在执行中
                              console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                              setTimeout(poll, pollInterval)
                            }
                          } else if (res.statusCode === 404) {
                            // 404 可能表示接口不存在
                            // 如果已经等待超过30秒，可能是接口不存在，直接返回初始响应
                            if (elapsed > 30) {
                              console.warn('多图生成：轮询接口404超过30秒，可能接口不存在。返回初始响应数据。')
                              console.log('初始响应数据:', initialData)
                              // 直接返回初始响应，让页面处理（可能已经包含结果）
                              resolve(initialData)
                            } else {
                              console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                              console.warn('多图生成：轮询接口404超过30秒，可能接口不存在。返回初始响应数据。')
                              console.log('初始响应数据:', initialData)
                              resolve(initialData)
                            } else {
                              console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                console.error('多图生成响应解析失败:', e, res.data)
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
                  console.error('多图生成：从响应体提取 prompt_id 失败:', e)
                }
              }
              
              if (promptId) {
                // 如果有 prompt_id，开始轮询
                console.log('多图生成：500错误但检测到 prompt_id，开始轮询...', promptId)
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
                            console.log('✅ 多图生成任务完成！耗时:', Math.round(elapsed), '秒')
                            resolve(pollData)
                          } else if (pollData.status === 'failed' || pollData.status === 'error') {
                            reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                          } else {
                            console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                            setTimeout(poll, pollInterval)
                          }
                        } catch (e) {
                          console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else if (pollRes.statusCode === 404) {
                        if (elapsed > 30) {
                          reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                        } else {
                          console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                          console.log(`⏳ 多图生成任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                console.warn('多图生成：500错误且未找到 prompt_id，立即重试...')
                
                // 立即重试，每5秒重试一次，最多重试60次（5分钟）
                const retryRequest = (retryCount: number = 0) => {
                  const maxRetries = 60 // 最多重试60次（约5分钟，每次间隔5秒）
                  if (retryCount >= maxRetries) {
                    reject(new Error('服务器处理时间过长，请稍后手动重试'))
                    return
                  }
                  
                  console.log(`多图生成：第${retryCount + 1}次重试（收到500错误）...`)
                  
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
                        console.warn(`多图生成：重试后仍收到500错误，${5}秒后继续重试...`)
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
                    fail: (_err) => {
                      // 网络错误也重试
                      console.warn(`多图生成：网络错误，${5}秒后继续重试...`)
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
                } else {
                  errorMsg = JSON.stringify(res.data) || errorMsg
                }
              }
              reject(new Error(errorMsg))
            }
          },
          fail: (_err) => {
            console.error('多图生成请求失败:', _err)
            reject(new Error(`网络错误: ${_err.errMsg || '请求失败'}`))
          }
        })
      })
      .catch((err) => {
        console.error('多图生成：读取图片文件失败:', err)
        reject(err)
      })
  })
}

/**
 * AI换装API调用
 * @param image1Path 模特图文件路径（必填）
 * @param image2Path 服装图文件路径（必填）
 * @param prompt 换装效果提示词（必填）
 * @param negativePrompt 负面提示词（可选）
 * @param seed 随机种子（可选）
 * @param onProgress 进度回调函数，接收已等待的秒数（可选）
 * @returns Promise<any> 返回API响应结果
 */
export const generateAIOutfit = async (
  image1Path: string,
  image2Path: string,
  prompt: string,
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
    if (!image1Path || !image2Path) {
      reject(new Error('请选择模特图和服装图'))
      return
    }

    if (!prompt || !prompt.trim()) {
      reject(new Error('请输入换装效果提示词'))
      return
    }

    const fs = wx.getFileSystemManager()

    console.log('AI换装：使用JSON格式发送base64数据', {
      hasImage1: !!image1Path,
      hasImage2: !!image2Path,
      promptLength: prompt.length,
      hasToken: !!accessToken
    })

    // 读取所有图片的base64数据
    const readImageAsBase64 = (filePath: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        fs.readFile({
          filePath: filePath,
          encoding: 'base64',
          success: (res) => {
            // base64编码时，data是string类型
            resolve(res.data as string)
          },
          fail: (err) => {
            reject(new Error(`读取文件失败: ${err.errMsg}`))
          }
        })
      })
    }

    // 读取所有图片
    Promise.all([
      readImageAsBase64(image1Path),
      readImageAsBase64(image2Path)
    ])
      .then(([base64Image1, base64Image2]) => {
        // 构建请求数据
        // 注意：后端可能要求三张图片，如果只有两张，使用第二张图片作为第三张
        const requestData: any = {
          image1_base64: base64Image1,
          image2_base64: base64Image2,
          image3_base64: base64Image2, // 使用第二张图片作为第三张（换装只需要两张图片）
          prompt: prompt.trim()
        }

        // 选填参数
        if (negativePrompt?.trim()) {
          requestData['negative_prompt'] = negativePrompt.trim()
        }
        if (seed !== undefined && seed !== null) {
          requestData['seed'] = seed.toString()
        }

        console.log('AI换装请求参数:', {
          imageCount: 2,
          hasPrompt: !!requestData['prompt'],
          hasNegativePrompt: !!requestData['negative_prompt'],
          hasSeed: requestData['seed'] !== undefined
        })

        // 发送请求
        // 用于存储从响应头中提取的 prompt_id
        let promptIdFromHeader: string | null = null
        
        wx.request({
          url: `${API_BASE}/chat/images/multi-generate`,
          method: 'POST',
          header: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          data: requestData,
          timeout: 1800000, // 30分钟超时
          success: (res) => {
            console.log('AI换装响应:', res.statusCode, typeof res.data === 'string' ? res.data.substring(0, 200) : res.data)
            
            // 输出详细的错误信息
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              console.error('AI换装错误详情:', JSON.stringify(res.data, null, 2))
            }

            if (res.statusCode === 200 || res.statusCode === 201) {
              try {
                const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
                console.log('AI换装解析后的响应数据:', {
                  hasPromptId: !!data.prompt_id,
                  videosCount: data.videos?.length || 0,
                  imagesCount: data.images?.length || 0,
                  cost: data.cost,
                  balance: data.balance
                })
                
                // 检查是否返回了 prompt_id（需要轮询）
                if (data.prompt_id) {
                  // 检查是否已经包含结果
                  const hasVideos = data.videos && Array.isArray(data.videos) && data.videos.length > 0
                  const hasImages = data.images && Array.isArray(data.images) && data.images.length > 0
                  const hasResult = hasVideos || hasImages || data.status === 'completed' || data.status === 'success'
                  
                  if (hasResult) {
                    console.log('AI换装：检测到 prompt_id 但已包含结果，直接返回（不轮询）', {
                      hasVideos,
                      hasImages,
                      status: data.status
                    })
                    resolve(data)
                  } else {
                    console.log('AI换装：检测到 prompt_id，开始轮询任务状态...')
                    // 保存初始响应数据，如果轮询失败可以返回它
                    const initialData = data
                    // 使用轮询机制获取结果
                    const startTime = Date.now()
                    const pollInterval = 3000 // 每3秒轮询一次
                    const maxWaitTime = 1800 // 30分钟超时
                    
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
                                console.log('✅ AI换装任务完成！耗时:', Math.round(elapsed), '秒')
                                resolve(pollData)
                              } else if (pollData.status === 'failed' || pollData.status === 'error') {
                                reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                              } else {
                                // 任务还在执行中，继续轮询
                                console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                                setTimeout(poll, pollInterval)
                              }
                            } catch (e) {
                              // 如果解析失败，可能是任务还在执行中
                              console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                              setTimeout(poll, pollInterval)
                            }
                          } else if (res.statusCode === 404) {
                            // 404 可能表示接口不存在
                            // 如果已经等待超过30秒，可能是接口不存在，直接返回初始响应
                            if (elapsed > 30) {
                              console.warn('AI换装：轮询接口404超过30秒，可能接口不存在。返回初始响应数据。')
                              console.log('初始响应数据:', initialData)
                              // 直接返回初始响应，让页面处理（可能已经包含结果）
                              resolve(initialData)
                            } else {
                              console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                              console.warn('AI换装：轮询接口404超过30秒，可能接口不存在。返回初始响应数据。')
                              console.log('初始响应数据:', initialData)
                              resolve(initialData)
                            } else {
                              console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                console.error('AI换装响应解析失败:', e, res.data)
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
                  console.error('AI换装：从响应体提取 prompt_id 失败:', e)
                }
              }
              
              if (promptId) {
                // 如果有 prompt_id，开始轮询
                console.log('AI换装：500错误但检测到 prompt_id，开始轮询...', promptId)
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
                            console.log('✅ AI换装任务完成！耗时:', Math.round(elapsed), '秒')
                            resolve(pollData)
                          } else if (pollData.status === 'failed' || pollData.status === 'error') {
                            reject(new Error(pollData.message || pollData.error || '任务执行失败'))
                          } else {
                            console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                            setTimeout(poll, pollInterval)
                          }
                        } catch (e) {
                          console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
                          setTimeout(poll, pollInterval)
                        }
                      } else if (pollRes.statusCode === 404) {
                        if (elapsed > 30) {
                          reject(new Error('轮询接口不存在(404)。后端可能已直接返回结果，请检查响应数据。'))
                        } else {
                          console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                          console.log(`⏳ AI换装任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
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
                console.warn('AI换装：500错误且未找到 prompt_id，立即重试...')
                
                // 立即重试，每5秒重试一次，最多重试60次（5分钟）
                const retryRequest = (retryCount: number = 0) => {
                  const maxRetries = 60 // 最多重试60次（约5分钟，每次间隔5秒）
                  if (retryCount >= maxRetries) {
                    reject(new Error('服务器处理时间过长，请稍后手动重试'))
                    return
                  }
                  
                  console.log(`AI换装：第${retryCount + 1}次重试（收到500错误）...`)
                  
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
                        console.warn(`AI换装：重试后仍收到500错误，${5}秒后继续重试...`)
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
                    fail: (_err) => {
                      // 网络错误也重试
                      console.warn(`AI换装：网络错误，${5}秒后继续重试...`)
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
                // 处理 non_field_errors 数组
                if (errorData.non_field_errors && Array.isArray(errorData.non_field_errors)) {
                  errorMsg = errorData.non_field_errors.join('; ') || errorMsg
                } else {
                  errorMsg = errorData.detail || errorData.message || errorMsg
                }
                // 如果有其他字段错误，也添加到错误信息中
                if (errorData && typeof errorData === 'object') {
                  const fieldErrors: string[] = []
                  for (const key in errorData) {
                    if (key !== 'non_field_errors' && key !== 'detail' && key !== 'message') {
                      const value = errorData[key]
                      if (Array.isArray(value)) {
                        fieldErrors.push(`${key}: ${value.join(', ')}`)
                      } else if (typeof value === 'string') {
                        fieldErrors.push(`${key}: ${value}`)
                      }
                    }
                  }
                  if (fieldErrors.length > 0) {
                    errorMsg += '; ' + fieldErrors.join('; ')
                  }
                }
              } catch (e) {
                if (typeof res.data === 'string') {
                  errorMsg = res.data
                } else {
                  errorMsg = JSON.stringify(res.data) || errorMsg
                }
              }
              reject(new Error(errorMsg))
            }
          },
          fail: (_err) => {
            console.error('AI换装请求失败:', _err)
            reject(new Error(`网络错误: ${_err.errMsg || '请求失败'}`))
          }
        })
      })
      .catch((err) => {
        console.error('AI换装：读取图片文件失败:', err)
        reject(err)
      })
  })
}
