import { generateImage, getAccessToken, setAccessToken, clearTokens } from '../../utils/api'

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
    this.checkLoginStatus()
    this.loadHistoryFromStorage()
    // 如果未登录，默认显示token输入区域
    const token = getAccessToken()
    if (!token) {
      this.setData({
        showTokenInput: true
      })
    }
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
  onTokenInput(e: WechatMiniprogram.InputEvent) {
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
  onPromptInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      prompt: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入负面提示词
  onNegativePromptInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      negativePrompt: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入随机种子
  onSeedInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      seed: e.detail.value,
      errorMessage: ''
    })
  },

  // 生成图片
  async onGenerate() {
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '提示',
        content: '请先登录或输入Token',
        showCancel: false,
        success: () => {
          this.setData({
            showTokenInput: true
          })
        }
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
      generatedImage: ''
    })

    try {
      // 再次检查token
      const token = getAccessToken()
      if (!token) {
        wx.showModal({
          title: '提示',
          content: '请先登录或输入Token',
          showCancel: false,
          success: () => {
            this.setData({
              showTokenInput: true
            })
          }
        })
        this.setData({
          loading: false
        })
        return
      }

      wx.showLoading({
        title: '生成中...',
        mask: true
      })

      // 解析seed参数
      const seed = this.data.seed.trim() ? parseInt(this.data.seed.trim()) : undefined
      const negativePrompt = this.data.negativePrompt.trim() || undefined

      console.log('开始生成图片，参数:', { prompt, negativePrompt, seed, hasToken: !!token })
      const result = await generateImage(prompt, negativePrompt, seed)
      
      wx.hideLoading()

      // 处理返回结果
      // 根据实际API返回格式调整
      console.log('API返回结果:', result)
      let imageUrl = ''
      
      // 处理images数组格式（从图片描述看，这是实际的返回格式）
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
      } else if (result.data && result.data.images && Array.isArray(result.data.images) && result.data.images.length > 0) {
        const firstImage = result.data.images[0]
        if (typeof firstImage === 'object' && firstImage.url) {
          imageUrl = firstImage.url
        } else {
          imageUrl = firstImage
        }
      } else if (result.url) {
        imageUrl = result.url
      } else if (typeof result === 'string') {
        imageUrl = result
      } else {
        // 如果返回的是base64或其他格式
        console.log('API返回结果:', result)
        imageUrl = result.image || result
      }
      
      console.log('提取的图片URL:', imageUrl ? imageUrl.substring(0, 50) + '...' : '未找到')

      // 显示消费信息（如果有）
      if (result.cost !== undefined) {
        console.log('消费星星数:', result.cost)
      }

      if (imageUrl) {
        this.setData({
          generatedImage: imageUrl,
          loading: false
        })

        // 保存到历史记录
        this.saveToHistory(prompt, imageUrl)
      } else {
        throw new Error('未获取到图片URL')
      }
    } catch (error: any) {
      wx.hideLoading()
      console.error('生成图片失败:', error)
      let errorMsg = error.message || '生成失败，请重试'
      
      // 如果是token相关错误，提示重新登录
      if (errorMsg.includes('token') || errorMsg.includes('Token') || errorMsg.includes('401') || errorMsg.includes('无效')) {
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
      return
    }

    wx.showLoading({
      title: '保存中...'
    })

    // 下载图片
    wx.downloadFile({
      url: this.data.generatedImage,
      success: (res) => {
        if (res.statusCode === 200) {
          // 保存到相册
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading()
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              })
            },
            fail: (err) => {
              wx.hideLoading()
              if (err.errMsg.includes('auth deny')) {
                wx.showModal({
                  title: '提示',
                  content: '需要授权访问相册',
                  showCancel: false
                })
              } else {
                wx.showToast({
                  title: '保存失败',
                  icon: 'none'
                })
              }
            }
          })
        } else {
          wx.hideLoading()
          wx.showToast({
            title: '下载失败',
            icon: 'none'
          })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({
          title: '下载失败',
          icon: 'none'
        })
      }
    })
  },

  // 重新生成
  regenerate() {
    this.setData({
      generatedImage: '',
      errorMessage: ''
    })
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

    this.setData({
      history
    })

    // 保存到本地存储（只保存提示词，不保存base64图片数据，避免超出存储限制）
    try {
      // 如果是 base64 数据（以 data: 开头），不保存图片数据，只保存提示词
      const isBase64 = image && image.startsWith('data:')
      const historyForStorage = history.map(item => ({
        id: item.id,
        prompt: item.prompt,
        // 如果是 base64，不保存图片数据；如果是 URL，可以保存
        image: isBase64 ? '' : item.image
      }))
      
      wx.setStorageSync('imageHistory', historyForStorage)
      console.log('历史记录已保存（base64图片数据已跳过）')
    } catch (error: any) {
      // 如果存储失败（可能数据太大），只保存提示词
      console.warn('保存完整历史记录失败，只保存提示词:', error)
      try {
        const historyForStorage = history.map(item => ({
          id: item.id,
          prompt: item.prompt,
          image: '' // 不保存图片数据
        }))
        wx.setStorageSync('imageHistory', historyForStorage)
        console.log('历史记录已保存（仅提示词）')
      } catch (e) {
        console.error('保存历史记录失败:', e)
        // 如果还是失败，不保存到本地存储，只在内存中保存
        console.warn('历史记录仅在内存中保存，页面刷新后会丢失')
      }
    }
  },

  // 从本地存储加载历史记录
  loadHistoryFromStorage() {
    try {
      const history = wx.getStorageSync('imageHistory') || []
      // 历史记录中可能没有图片数据（base64数据被跳过了），这是正常的
      this.setData({
        history
      })
      console.log('历史记录已加载:', history.length, '条')
    } catch (error) {
      console.error('加载历史记录失败:', error)
      // 如果加载失败，使用空数组
      this.setData({
        history: []
      })
    }
  },

  // 加载历史记录项
  loadHistory(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    const item = this.data.history[index]
    if (item) {
      this.setData({
        prompt: item.prompt,
        generatedImage: item.image,
        errorMessage: ''
      })
    }
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    return {
      title: '文生图 - AI智能体，通过文字描述生成精美图片',
      path: '/pages/text-to-image/text-to-image',
      imageUrl: this.data.generatedImage || undefined
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发
  onShareTimeline() {
    return {
      title: '文生图 - AI智能体，通过文字描述生成精美图片',
      query: '',
      imageUrl: this.data.generatedImage || undefined
    }
  }
})

