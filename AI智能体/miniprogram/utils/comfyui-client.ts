/**
 * ComfyUI 客户端工具
 * 直接调用 ComfyUI API，不通过后端中转
 */

// ComfyUI 服务器配置（从Python脚本中提取）
const COMFYUI_SERVER_URL = "https://u143265--7643f9efaf6e.westd.seetacloud.com:8443"
const COMFYUI_API_KEY = "comfyui-3c430f65a5d2e04a2dbbee5682c3fdc843b2e9684df126bb680ccaa37d7ca1a1"

/**
 * 上传图片到 ComfyUI 服务器
 * @param imagePath 图片文件路径
 * @returns Promise<string> 返回服务器上的文件名
 */
export const uploadImageToComfyUI = async (imagePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    console.log('📤 正在上传图片到 ComfyUI...', imagePath)
    
    wx.uploadFile({
      url: `${COMFYUI_SERVER_URL}/upload/image`,
      filePath: imagePath,
      name: 'image',
      formData: {
        'overwrite': 'true'
      },
      header: {
        'Authorization': `Bearer ${COMFYUI_API_KEY}`
      },
      timeout: 60000, // 60秒超时
      success: (res) => {
        if (res.statusCode === 200) {
          try {
            const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
            let filename = data.name || ''
            if (data.subfolder) {
              filename = `${data.subfolder}/${filename}`
            }
            console.log('✅ 图片上传成功:', filename)
            resolve(filename)
          } catch (e) {
            console.error('解析上传响应失败:', e)
            reject(new Error('解析上传响应失败'))
          }
        } else {
          console.error('图片上传失败:', res.statusCode, res.data)
          reject(new Error(`上传失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        console.error('图片上传网络错误:', err)
        reject(new Error(`网络错误: ${err.errMsg || '上传失败'}`))
      }
    })
  })
}

/**
 * 提交工作流任务到 ComfyUI
 * @param workflowData 工作流JSON数据
 * @returns Promise<string> 返回 prompt_id
 */
export const queuePrompt = async (workflowData: any): Promise<string> => {
  return new Promise((resolve, reject) => {
    const clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    const payload = {
      prompt: workflowData,
      client_id: clientId
    }
    
    console.log('🚀 提交工作流任务到 ComfyUI...')
    
    wx.request({
      url: `${COMFYUI_SERVER_URL}/prompt`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COMFYUI_API_KEY}`
      },
      data: payload,
      timeout: 60000,
      success: (res) => {
        if (res.statusCode === 200) {
          const data = res.data as any
          const promptId = data.prompt_id
          if (promptId) {
            console.log('✅ 任务提交成功, prompt_id:', promptId)
            resolve(promptId)
          } else {
            reject(new Error('未获取到 prompt_id'))
          }
        } else {
          console.error('任务提交失败:', res.statusCode, res.data)
          reject(new Error(`提交失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        console.error('任务提交网络错误:', err)
        reject(new Error(`网络错误: ${err.errMsg || '提交失败'}`))
      }
    })
  })
}

/**
 * 获取任务历史记录
 * @param promptId 任务ID
 * @returns Promise<any> 返回历史记录
 */
export const getHistory = async (promptId: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${COMFYUI_SERVER_URL}/history/${promptId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${COMFYUI_API_KEY}`
      },
      timeout: 30000,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          reject(new Error(`获取历史失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(new Error(`网络错误: ${err.errMsg || '获取历史失败'}`))
      }
    })
  })
}

/**
 * 下载文件（图片）
 * @param filename 文件名
 * @param subfolder 子文件夹
 * @param fileType 文件类型（通常是 'output'）
 * @returns Promise<string> 返回 base64 编码的图片数据
 */
export const downloadFile = async (filename: string, subfolder: string = '', fileType: string = 'output'): Promise<string> => {
  return new Promise((resolve, reject) => {
    const params: any = {
      filename: filename,
      type: fileType
    }
    if (subfolder) {
      params.subfolder = subfolder
    }
    
    const queryString = Object.keys(params).map(key => `${key}=${encodeURIComponent(params[key])}`).join('&')
    const url = `${COMFYUI_SERVER_URL}/view?${queryString}`
    
    console.log('⬇️ 正在下载文件:', filename)
    
    wx.request({
      url: url,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${COMFYUI_API_KEY}`
      },
      responseType: 'arraybuffer', // 重要：使用 arraybuffer 接收二进制数据
      timeout: 60000,
      success: (res) => {
        if (res.statusCode === 200) {
          // 将 arraybuffer 转换为 base64
          const fs = wx.getFileSystemManager()
          const base64 = wx.arrayBufferToBase64(res.data as ArrayBuffer)
          const dataUrl = `data:image/png;base64,${base64}`
          console.log('✅ 文件下载成功:', filename)
          resolve(dataUrl)
        } else {
          reject(new Error(`下载失败: ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(new Error(`网络错误: ${err.errMsg || '下载失败'}`))
      }
    })
  })
}

/**
 * 轮询任务状态并获取所有输出图片
 * @param promptId 任务ID
 * @param maxWaitTime 最大等待时间（秒），默认600秒（10分钟）
 * @returns Promise<Array<{node_id: string, filename: string, url: string}>>
 */
export const trackAndGetImages = async (
  promptId: string,
  maxWaitTime: number = 600
): Promise<Array<{node_id: string, filename: string, url: string}>> => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const pollInterval = 3000 // 每3秒轮询一次
    
    const poll = () => {
      const elapsed = (Date.now() - startTime) / 1000
      
      if (elapsed > maxWaitTime) {
        reject(new Error('任务超时：超过最大等待时间'))
        return
      }
      
      getHistory(promptId)
        .then((history: any) => {
          if (promptId in history) {
            console.log('✅ 任务完成！耗时:', Math.round(elapsed), '秒')
            const outputs = history[promptId].outputs || {}
            
            if (!outputs || Object.keys(outputs).length === 0) {
              reject(new Error('任务完成但没有输出文件'))
              return
            }
            
            // 收集所有图片
            const imagePromises: Array<Promise<{node_id: string, filename: string, url: string}>> = []
            
            for (const nodeId in outputs) {
              const nodeOutput = outputs[nodeId]
              
              // 处理图片输出
              if (nodeOutput.images && Array.isArray(nodeOutput.images)) {
                for (const image of nodeOutput.images) {
                  const promise = downloadFile(
                    image.filename,
                    image.subfolder || '',
                    image.type || 'output'
                  ).then(url => ({
                    node_id: nodeId,
                    filename: image.filename,
                    url: url
                  }))
                  imagePromises.push(promise)
                }
              }
            }
            
            if (imagePromises.length === 0) {
              reject(new Error('未找到输出图片'))
              return
            }
            
            // 等待所有图片下载完成
            Promise.all(imagePromises)
              .then(images => {
                console.log('✅ 所有图片下载完成，共', images.length, '张')
                resolve(images)
              })
              .catch(reject)
          } else {
            // 任务还在执行中，继续轮询
            console.log(`⏳ 任务执行中... (已等待 ${Math.round(elapsed)}秒)`)
            setTimeout(poll, pollInterval)
          }
        })
        .catch((err) => {
          // 如果是404（任务还未完成），继续轮询
          if (err.message && err.message.includes('404')) {
            setTimeout(poll, pollInterval)
          } else {
            reject(err)
          }
        })
    }
    
    // 开始轮询
    poll()
  })
}

/**
 * 加载工作流JSON文件
 * 从用户数据目录读取，如果不存在则尝试从内联数据初始化
 * @returns Promise<any> 返回工作流JSON数据
 */
export const loadWorkflow = async (): Promise<any> => {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager()
    const localPath = `${wx.env.USER_DATA_PATH || ''}/grid-workflow.json`
    
    // 先尝试从用户数据目录读取
    fs.readFile({
      filePath: localPath,
      encoding: 'utf8',
      success: (res) => {
        try {
          const workflow = JSON.parse(res.data as string)
          console.log('✅ 从本地文件加载工作流成功')
          resolve(workflow)
        } catch (parseError) {
          reject(new Error('解析工作流JSON失败: ' + (parseError as Error).message))
        }
      },
      fail: () => {
        // 文件不存在，尝试从项目中的 TypeScript 模块加载
        console.log('工作流文件不存在，尝试从项目文件加载...')
        
        try {
          // 尝试从 grid-workflow-data.ts 加载
          const { gridWorkflowData } = require('./grid-workflow-data')
          
          // 写入用户数据目录
          fs.writeFile({
            filePath: localPath,
            data: JSON.stringify(gridWorkflowData),
            encoding: 'utf8',
            success: () => {
              console.log('✅ 工作流文件已从项目文件初始化并保存')
              resolve(gridWorkflowData)
            },
            fail: (err) => {
              // 即使写入失败，也返回数据
              console.warn('保存工作流文件失败，但可以使用内存中的数据:', err)
              resolve(gridWorkflowData)
            }
          })
        } catch (e) {
          // 如果 require 失败，提示用户
          reject(new Error('工作流文件加载失败。\n\n请确保 grid-workflow-data.ts 文件已正确生成。\n\n错误: ' + ((e as Error).message || '未知错误')))
        }
      }
    })
  })
}

