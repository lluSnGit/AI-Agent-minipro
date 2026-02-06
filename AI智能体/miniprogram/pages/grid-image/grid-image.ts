import { 
  uploadImageToComfyUI, 
  loadWorkflow, 
  queuePrompt, 
  trackAndGetImages 
} from '../../utils/comfyui-client'

Page({
  data: {
    image: '', // 输入图片文件路径
    imagePath: '', // 原始路径（用于上传）
    prompt: '生成九宫格多角度图片',
    negativePrompt: 'broken image, split view, grid, multiple angles, frame, border, black bar',
    seed: '',
    loading: false,
    generatedImages: [] as Array<{ node_id: string, filename: string, url: string }>,
    errorMessage: ''
  },

  onLoad() {
    // 直接调用ComfyUI，不需要登录检查
    console.log('九宫格图页面加载完成')
  },

  onShow() {
    // 页面显示时无需特殊处理
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        // 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 80,
          success: (compressRes) => {
            this.setData({
              image: compressRes.tempFilePath,
              imagePath: compressRes.tempFilePath
            })
            wx.showToast({
              title: '图片选择成功',
              icon: 'success',
              duration: 1500
            })
          },
          fail: () => {
            // 压缩失败，使用原图
            this.setData({
              image: tempFilePath,
              imagePath: tempFilePath
            })
          }
        })
      }
    })
  },

  // 移除图片
  removeImage() {
    this.setData({
      image: '',
      imagePath: ''
    })
  },

  // 输入提示词
  onPromptInput(e: any) {
    this.setData({
      prompt: e.detail.value
    })
  },

  // 输入负面提示词
  onNegativePromptInput(e: any) {
    this.setData({
      negativePrompt: e.detail.value
    })
  },

  // 输入随机种子
  onSeedInput(e: any) {
    this.setData({
      seed: e.detail.value
    })
  },

  // 生成九宫格图（直接调用ComfyUI，不需要登录）
  async onGenerate() {

    // 验证必填项
    if (!this.data.imagePath) {
      wx.showToast({
        title: '请选择输入图片',
        icon: 'none',
        duration: 2000
      })
      return
    }

    const prompt = this.data.prompt.trim()
    if (!prompt) {
      wx.showToast({
        title: '请输入提示词',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: '',
      generatedImages: []
    })

    try {
      wx.showLoading({
        title: '生成中...',
        mask: true
      })

      // 解析seed参数
      const seed = this.data.seed.trim() ? parseInt(this.data.seed.trim()) : undefined
      const negativePrompt = this.data.negativePrompt.trim() || undefined

      console.log('开始生成九宫格图（使用ComfyUI工作流），参数:', { 
        hasImage: !!this.data.imagePath,
        prompt, 
        negativePrompt, 
        seed
      })
      
      // 步骤1: 上传图片到 ComfyUI 服务器
      wx.showLoading({
        title: '上传图片中...',
        mask: true
      })
      const serverImageFilename = await uploadImageToComfyUI(this.data.imagePath)
      console.log('✅ 图片上传成功:', serverImageFilename)
      
      // 步骤2: 加载工作流
      wx.showLoading({
        title: '加载工作流...',
        mask: true
      })
      const workflow = await loadWorkflow()
      console.log('✅ 工作流加载成功')
      
      // 步骤3: 修改工作流参数
      // 3.1 修改节点94（LoadImage）的图片路径
      if (workflow['94']) {
        workflow['94']['inputs']['image'] = serverImageFilename
        console.log('✅ 节点94图片已更新:', serverImageFilename)
      } else {
        console.warn('⚠️ 未找到节点94，图片可能未正确设置')
      }
      
      // 3.2 随机化所有采样器的种子（如果用户没有指定seed）
      const randomSeed = seed || Math.floor(Math.random() * 1000000000000000)
      let seedCount = 0
      for (const nodeId in workflow) {
        const nodeInfo = workflow[nodeId]
        if (nodeInfo && nodeInfo.inputs && 'seed' in nodeInfo.inputs) {
          workflow[nodeId].inputs.seed = randomSeed
          seedCount++
        }
      }
      console.log(`✅ 已更新 ${seedCount} 个节点的随机种子为: ${randomSeed}`)
      
      // 步骤4: 提交任务
      wx.showLoading({
        title: '提交任务中...',
        mask: true
      })
      const promptId = await queuePrompt(workflow)
      console.log('✅ 任务提交成功, prompt_id:', promptId)
      
      // 步骤5: 轮询获取结果
      wx.showLoading({
        title: '生成中，请稍候...',
        mask: true
      })
      const images = await trackAndGetImages(promptId, 600) // 最多等待10分钟
      
      wx.hideLoading()

      // 处理返回结果
      console.log('✅ 生成完成，共', images.length, '张图片')
      
      if (images && images.length > 0) {
        this.setData({
          generatedImages: images,
          loading: false
        })

        wx.showToast({
          title: `生成成功，共${images.length}张图片`,
          icon: 'success',
          duration: 2000
        })
      } else {
        throw new Error('未找到生成的图片')
      }
    } catch (error: any) {
      console.error('生成九宫格图失败:', error)
      wx.hideLoading()
      let errorMsg = error.message || '生成失败，请重试'
      
      // 显示错误信息
      this.setData({
        errorMessage: errorMsg,
        loading: false
      })
      wx.showToast({
        title: errorMsg.length > 20 ? errorMsg.substring(0, 20) + '...' : errorMsg,
        icon: 'none',
        duration: 3000
      })
      
      this.setData({
        loading: false
      })
    }
  },

  // 预览图片
  previewImage(e: any) {
    const index = e.currentTarget.dataset.index
    const images = this.data.generatedImages
    if (images && images.length > 0) {
      const urls = images.map(img => img.url)
      wx.previewImage({
        urls: urls,
        current: urls[index] || urls[0]
      })
    }
  },

  // 保存图片
  saveImage(e: any) {
    const index = e.currentTarget.dataset.index
    const image = this.data.generatedImages[index]
    if (!image || !image.url) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    // 如果是base64格式，需要先下载
    if (image.url.startsWith('data:image')) {
      // base64格式，需要转换为临时文件
      const base64 = image.url.split(',')[1] || image.url
      const fs = wx.getFileSystemManager()
      const filePath = `${wx.env.USER_DATA_PATH}/grid_image_${Date.now()}_${index}.png`
      
      try {
        const arrayBuffer = wx.base64ToArrayBuffer(base64)
        fs.writeFileSync(filePath, arrayBuffer, 'binary')
        
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
            wx.showToast({
              title: '保存成功',
              icon: 'success'
            })
          },
          fail: (err) => {
            console.error('保存失败:', err)
            wx.showToast({
              title: '保存失败',
              icon: 'none'
            })
          }
        })
      } catch (error) {
        console.error('转换base64失败:', error)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    } else {
      // 普通URL，先下载再保存
      wx.downloadFile({
        url: image.url,
        success: (res) => {
          if (res.statusCode === 200) {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.showToast({
                  title: '保存成功',
                  icon: 'success'
                })
              },
              fail: () => {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                })
              }
            })
          }
        },
        fail: () => {
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          })
        }
      })
    }
  },

  // 保存所有图片
  saveAllImages() {
    if (!this.data.generatedImages || this.data.generatedImages.length === 0) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '保存中...',
      mask: true
    })

    let savedCount = 0
    let totalCount = this.data.generatedImages.length

    const saveNext = (index: number) => {
      if (index >= totalCount) {
        wx.hideLoading()
        wx.showToast({
          title: `已保存${savedCount}张图片`,
          icon: 'success'
        })
        return
      }

      const image = this.data.generatedImages[index]
      if (!image || !image.url) {
        saveNext(index + 1)
        return
      }

      // 如果是base64格式
      if (image.url.startsWith('data:image')) {
        const base64 = image.url.split(',')[1] || image.url
        const fs = wx.getFileSystemManager()
        const filePath = `${wx.env.USER_DATA_PATH}/grid_image_${Date.now()}_${index}.png`
        
        try {
          const arrayBuffer = wx.base64ToArrayBuffer(base64)
          fs.writeFileSync(filePath, arrayBuffer, 'binary')
          
          wx.saveImageToPhotosAlbum({
            filePath: filePath,
            success: () => {
              savedCount++
              saveNext(index + 1)
            },
            fail: () => {
              saveNext(index + 1)
            }
          })
        } catch (error) {
          saveNext(index + 1)
        }
      } else {
        // 普通URL
        wx.downloadFile({
          url: image.url,
          success: (res) => {
            if (res.statusCode === 200) {
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => {
                  savedCount++
                  saveNext(index + 1)
                },
                fail: () => {
                  saveNext(index + 1)
                }
              })
            } else {
              saveNext(index + 1)
            }
          },
          fail: () => {
            saveNext(index + 1)
          }
        })
      }
    }

    saveNext(0)
  },

  // 重新生成
  regenerate() {
    this.onGenerate()
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    const firstImage = this.data.generatedImages && this.data.generatedImages.length > 0 ? this.data.generatedImages[0].url : undefined
    return {
      title: '九宫格图 - AI智能体，多角度展示产品细节',
      path: '/pages/grid-image/grid-image',
      imageUrl: firstImage
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发
  onShareTimeline() {
    const firstImage = this.data.generatedImages && this.data.generatedImages.length > 0 ? this.data.generatedImages[0].url : undefined
    return {
      title: '九宫格图 - AI智能体，多角度展示产品细节',
      query: '',
      imageUrl: firstImage
    }
  }
})

