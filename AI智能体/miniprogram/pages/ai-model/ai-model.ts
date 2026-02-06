import { generateAIModel, getAccessToken, setAccessToken, clearTokens } from '../../utils/api'

Page({
  data: {
    prompt: '',
    negativePrompt: '',
    seed: '',
    loading: false,
    generatedImage: '',
    errorMessage: '',
    isLoggedIn: false,
    accessToken: '',
    showTokenInput: false,
    history: [] as Array<{ id: number, prompt: string, image: string }>
  },

  onLoad() {
    // 页面加载时检查登录状态（和文生图一样）
    const token = getAccessToken()
    // 如果未登录，默认显示token输入区域
    if (!token) {
      this.setData({
        showTokenInput: true
      })
    }
    this.checkLoginStatus()
    this.loadHistoryFromStorage()
  },

  onShow() {
    // 每次显示页面时检查登录状态（从登录页返回时）
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = getAccessToken()
    // Token有效性检查：正常token应该至少50个字符
    const isValidToken = token && token.length > 50
    console.log('检查登录状态:', { hasToken: !!token, tokenLength: token?.length || 0, isValidToken })
    
    // 如果token无效，清除它
    if (token && !isValidToken) {
      console.warn('检测到无效token，已清除')
      clearTokens()
      this.setData({
        isLoggedIn: false,
        accessToken: '',
        showTokenInput: true // 显示token输入区域
      })
    } else {
      this.setData({
        isLoggedIn: !!isValidToken,
        accessToken: token || ''
      })
    }
  },

  // 输入token
  onTokenInput(e: any) {
    this.setData({
      accessToken: e.detail.value
    })
  },

  // 保存token
  onSaveToken() {
    const token = this.data.accessToken.trim()
    if (!token) {
      wx.showToast({
        title: 'Token不能为空',
        icon: 'none'
      })
      return
    }
    setAccessToken(token)
    wx.showToast({
      title: 'Token已保存',
      icon: 'success'
    })
    this.setData({
      showTokenInput: false,
      isLoggedIn: true
    })
    // 重新检查登录状态
    this.checkLoginStatus()
  },

  // 切换token输入显示
  toggleTokenInput() {
    this.setData({
      showTokenInput: !this.data.showTokenInput
    })
  },

  // 跳转到登录页
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

  // 清除Token并重新登录
  clearTokenAndRelogin() {
    wx.showModal({
      title: '提示',
      content: '确定要清除当前Token吗？',
      success: (res) => {
        if (res.confirm) {
          clearTokens()
          this.checkLoginStatus()
          wx.showToast({
            title: 'Token已清除',
            icon: 'success'
          })
        }
      }
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

  // 生成图片
  async onGenerate() {
    // 检查登录状态（和文生图一样）
    const token = getAccessToken()
    if (!token || token.length < 50) {
      wx.showModal({
        title: 'Token无效',
        content: '您的Access Token无效或已过期，请重新登录或输入有效Token。',
        showCancel: false,
        success: () => {
          this.setData({ 
            showTokenInput: true,
            isLoggedIn: false
          })
        }
      })
      this.setData({ loading: false })
      return
    }

    const prompt = this.data.prompt.trim()
    if (!prompt) {
      wx.showToast({
        title: '请输入AI模特描述提示词',
        icon: 'none'
      })
      return
    }

    this.setData({
      loading: true,
      errorMessage: '',
      generatedImage: ''
    })

    try {
      wx.showLoading({
        title: '生成中...',
        mask: true
      })

      // 解析seed参数
      const seed = this.data.seed.trim() ? parseInt(this.data.seed.trim()) : undefined
      const negativePrompt = this.data.negativePrompt.trim() || undefined

      console.log('开始生成AI模特，参数:', { prompt, negativePrompt, seed, hasToken: !!token })
      const result = await generateAIModel(prompt, negativePrompt, seed)
      
      wx.hideLoading()

      // 处理返回结果
      console.log('API返回结果:', result)
      let imageUrl = ''
      
      // 处理images数组格式
      if (result.images && Array.isArray(result.images) && result.images.length > 0) {
        const firstImage = result.images[0]
        // 如果images数组中的元素是对象，取url字段
        if (typeof firstImage === 'object' && firstImage.url) {
          imageUrl = firstImage.url
        } else if (typeof firstImage === 'string') {
          imageUrl = firstImage
        } else {
          imageUrl = firstImage
        }
      } else if (result.image_url) {
        imageUrl = result.image_url
      } else if (result.data && result.data.image_url) {
        imageUrl = result.data.image_url
      }

      // 处理base64格式的图片URL
      if (imageUrl && imageUrl.startsWith('data:image')) {
        // base64格式，直接使用
        this.setData({
          generatedImage: imageUrl,
          loading: false
        })
      } else if (imageUrl) {
        // 普通URL格式
        this.setData({
          generatedImage: imageUrl,
          loading: false
        })
      } else {
        throw new Error('未找到生成的图片')
      }

      // 保存到历史记录
      this.saveToHistory(prompt, imageUrl)

      wx.showToast({
        title: '生成成功',
        icon: 'success'
      })
    } catch (error: any) {
      console.error('生成AI模特失败:', error)
      wx.hideLoading()
      let errorMsg = error.message || '生成失败，请重试'
      
      // 如果是token相关错误，提示重新登录
      if (errorMsg.includes('token') || errorMsg.includes('Token') || errorMsg.includes('401') || errorMsg.includes('无效') || errorMsg.includes('过期')) {
        wx.showModal({
          title: 'Token无效',
          content: errorMsg + '\n\n请重新登录获取新的Token',
          showCancel: false,
          confirmText: '去登录',
          success: () => {
            // 清除无效token
            clearTokens()
            this.checkLoginStatus()
            // 跳转到登录页
            this.goToLogin()
          }
        })
      } else {
        // 其他错误直接显示
        this.setData({
          errorMessage: errorMsg,
          loading: false
        })
        wx.showToast({
          title: errorMsg.length > 20 ? errorMsg.substring(0, 20) + '...' : errorMsg,
          icon: 'none',
          duration: 3000
        })
      }
      
      this.setData({
        loading: false
      })
    }
  },

  // 预览图片
  previewImage() {
    if (this.data.generatedImage) {
      wx.previewImage({
        urls: [this.data.generatedImage],
        current: this.data.generatedImage
      })
    }
  },

  // 保存图片
  saveImage() {
    if (!this.data.generatedImage) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    // 如果是base64格式，需要先下载
    if (this.data.generatedImage.startsWith('data:image')) {
      // base64格式，需要转换为临时文件
      const base64 = this.data.generatedImage.split(',')[1] || this.data.generatedImage
      const fs = wx.getFileSystemManager()
      const filePath = `${wx.env.USER_DATA_PATH}/ai_model_${Date.now()}.png`
      
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
        url: this.data.generatedImage,
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

  // 重新生成
  regenerate() {
    this.onGenerate()
  },

  // 保存到历史记录
  saveToHistory(prompt: string, image: string) {
    const history = this.data.history
    const newItem = {
      id: Date.now(),
      prompt,
      image
    }
    history.unshift(newItem)
    // 最多保存10条
    if (history.length > 10) {
      history.pop()
    }
    this.setData({ history })
    this.saveHistoryToStorage()
  },

  // 从存储加载历史记录
  loadHistoryFromStorage() {
    try {
      const history = wx.getStorageSync('ai_model_history')
      if (history) {
        this.setData({ history })
      }
    } catch (error) {
      console.error('加载历史记录失败:', error)
    }
  },

  // 保存历史记录到存储
  saveHistoryToStorage() {
    try {
      wx.setStorageSync('ai_model_history', this.data.history)
    } catch (error) {
      console.error('保存历史记录失败:', error)
    }
  },

  // 加载历史记录
  loadHistory(e: any) {
    const index = e.currentTarget.dataset.index
    const item = this.data.history[index]
    if (item) {
      this.setData({
        prompt: item.prompt,
        generatedImage: item.image
      })
    }
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    return {
      title: 'AI模特 - AI智能体，定制虚拟形象，告别高成本',
      path: '/pages/ai-model/ai-model',
      imageUrl: this.data.generatedImage || undefined
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发
  onShareTimeline() {
    return {
      title: 'AI模特 - AI智能体，定制虚拟形象，告别高成本',
      query: '',
      imageUrl: this.data.generatedImage || undefined
    }
  }
})

