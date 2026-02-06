import { generateMultiImageToVideo, getAccessToken, setAccessToken, clearTokens } from '../../utils/api'

Page({
  data: {
    images: [] as Array<{ path: string, preview: string }>, // 图片列表
    prompt: '', // 5秒视频提示词
    prompt1: '', // 10秒视频第一个提示词（0-5秒）
    prompt2: '', // 10秒视频第二个提示词（5-10秒）
    negativePrompt: '',
    seed: '',
    nFrames: 150, // 默认5秒（150帧）
    loading: false,
    generatedVideos: [] as Array<{ node_id: string, filename: string, url: string, mime_type: string }>,
    generatedImages: [] as Array<{ node_id: string, filename: string, url: string }>,
    errorMessage: '',
    isLoggedIn: false,
    accessToken: '',
    showTokenInput: false,
    cost: '',
    balance: ''
  },

  onLoad() {
    const token = getAccessToken()
    const isValidToken = token && token.length > 50
    
    this.setData({
      isLoggedIn: !!isValidToken,
      accessToken: token || '',
      showTokenInput: !isValidToken
    })
  },

  onShow() {
    this.checkLoginStatus()
  },

  checkLoginStatus() {
    const token = getAccessToken()
    const isValidToken = token && token.length > 50
    console.log('检查登录状态:', { hasToken: !!token, tokenLength: token?.length || 0, isValidToken })
    
    if (token && !isValidToken) {
      console.warn('检测到无效token，已清除')
      clearTokens()
      this.setData({
        isLoggedIn: false,
        accessToken: '',
        showTokenInput: true
      })
    } else {
      this.setData({
        isLoggedIn: !!isValidToken,
        accessToken: token || ''
      })
    }
  },

  onTokenInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      accessToken: e.detail.value
    })
  },

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
    this.checkLoginStatus()
  },

  toggleTokenInput() {
    this.setData({
      showTokenInput: !this.data.showTokenInput
    })
  },

  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    })
  },

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

  // 选择图片
  chooseImage() {
    const maxCount = 3 - this.data.images.length
    if (maxCount <= 0) {
      wx.showToast({
        title: '最多只能选择3张图片',
        icon: 'none'
      })
      return
    }

    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFilePaths.map(path => ({
          path: path,
          preview: path
        }))
        this.setData({
          images: [...this.data.images, ...newImages],
          errorMessage: ''
        })
      },
      fail: (err) => {
        console.error('选择图片失败:', err)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 移除图片
  removeImage(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    const images = this.data.images
    images.splice(index, 1)
    this.setData({
      images: images
    })
  },

  // 输入提示词（5秒视频）
  onPromptInput(e: WechatMiniprogram.InputEvent) {
    this.setData({
      prompt: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入第一个提示词（10秒视频）
  onPrompt1Input(e: WechatMiniprogram.InputEvent) {
    this.setData({
      prompt1: e.detail.value,
      errorMessage: ''
    })
  },

  // 输入第二个提示词（10秒视频）
  onPrompt2Input(e: WechatMiniprogram.InputEvent) {
    this.setData({
      prompt2: e.detail.value,
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

  // 选择视频时长
  onDurationChange(e: WechatMiniprogram.RadioGroupChangeEvent) {
    const value = parseInt(e.detail.value)
    this.setData({
      nFrames: value
    })
  },

  // 生成视频
  async onGenerate() {
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

    if (this.data.images.length === 0) {
      wx.showToast({
        title: '请至少选择一张图片',
        icon: 'none'
      })
      return
    }

    // 验证提示词
    if (this.data.nFrames === 300) {
      // 10秒视频需要两个提示词
      if (!this.data.prompt1.trim() || !this.data.prompt2.trim()) {
        wx.showToast({
          title: '10秒视频需要提供两个提示词',
          icon: 'none'
        })
        return
      }
    } else {
      // 5秒视频需要一个提示词
      if (!this.data.prompt.trim()) {
        wx.showToast({
          title: '请输入视频描述',
          icon: 'none'
        })
        return
      }
    }

    this.setData({
      loading: true,
      errorMessage: '',
      generatedVideos: [],
      generatedImages: [],
      cost: '',
      balance: ''
    })

    try {
      const seed = this.data.seed.trim() ? parseInt(this.data.seed.trim()) : undefined
      const negativePrompt = this.data.negativePrompt.trim() || undefined
      const imagePaths = this.data.images.map(img => img.path)

      console.log('开始生成多图视频，参数:', { 
        imageCount: imagePaths.length,
        nFrames: this.data.nFrames,
        prompt: this.data.prompt,
        prompt1: this.data.prompt1,
        prompt2: this.data.prompt2,
        negativePrompt, 
        seed, 
        hasToken: !!token 
      })

      wx.showLoading({
        title: '提交任务中...',
        mask: true
      })
      
      const onProgress = (elapsed: number) => {
        const minutes = Math.floor(elapsed / 60)
        const seconds = elapsed % 60
        const timeText = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
        wx.showLoading({
          title: `生成中，已等待${timeText}...`,
          mask: true
        })
      }

      const result = await generateMultiImageToVideo(
        imagePaths,
        this.data.nFrames,
        this.data.nFrames === 300 ? undefined : this.data.prompt,
        this.data.nFrames === 300 ? this.data.prompt1 : undefined,
        this.data.nFrames === 300 ? this.data.prompt2 : undefined,
        negativePrompt,
        seed,
        onProgress
      )
      
      wx.hideLoading()

      console.log('API返回结果:', result)
      
      // 提取视频（优化：对于base64视频，转换为临时文件，避免setData传输过大）
      const videos: Array<{ node_id: string, filename: string, url: string, mime_type: string }> = []
      const fs = wx.getFileSystemManager()
      
      if (result.videos && Array.isArray(result.videos)) {
        for (let i = 0; i < result.videos.length; i++) {
          const video = result.videos[i]
          const isBase64 = video.url && video.url.startsWith('data:video')
          
          if (isBase64) {
            try {
              const base64 = video.url.split(',')[1] || video.url
              const filePath = `${wx.env.USER_DATA_PATH}/video_${Date.now()}_${i}.mp4`
              const arrayBuffer = wx.base64ToArrayBuffer(base64)
              fs.writeFileSync(filePath, arrayBuffer, 'binary')
              
              videos.push({
                node_id: video.node_id || '',
                filename: video.filename || '',
                url: filePath,
                mime_type: video.mime_type || 'video/mp4'
              })
            } catch (error) {
              console.error('转换base64视频失败:', error)
              videos.push({
                node_id: video.node_id || '',
                filename: video.filename || '',
                url: video.url || '',
                mime_type: video.mime_type || 'video/mp4'
              })
            }
          } else {
            videos.push({
              node_id: video.node_id || '',
              filename: video.filename || '',
              url: video.url || '',
              mime_type: video.mime_type || 'video/mp4'
            })
          }
        }
      }
      
      // 提取图片
      const images: Array<{ node_id: string, filename: string, url: string }> = []
      if (result.images && Array.isArray(result.images)) {
        for (let i = 0; i < result.images.length; i++) {
          const img = result.images[i]
          const isBase64 = img.url && img.url.startsWith('data:image')
          
          if (isBase64) {
            try {
              const base64 = img.url.split(',')[1] || img.url
              const filePath = `${wx.env.USER_DATA_PATH}/image_${Date.now()}_${i}.png`
              const arrayBuffer = wx.base64ToArrayBuffer(base64)
              fs.writeFileSync(filePath, arrayBuffer, 'binary')
              
              images.push({
                node_id: img.node_id || '',
                filename: img.filename || '',
                url: filePath
              })
            } catch (error) {
              console.error('转换base64图片失败:', error)
              images.push({
                node_id: img.node_id || '',
                filename: img.filename || '',
                url: img.url || ''
              })
            }
          } else {
            images.push({
              node_id: img.node_id || '',
              filename: img.filename || '',
              url: img.url || ''
            })
          }
        }
      }
      
      const cost = result.cost || ''
      const balance = result.balance || ''

      if (videos.length > 0 || images.length > 0) {
        this.setData({
          generatedVideos: videos,
          generatedImages: images,
          cost: cost,
          balance: balance,
          loading: false
        })

        wx.showToast({
          title: `生成成功！${videos.length}个视频${images.length > 0 ? `，${images.length}张图片` : ''}`,
          icon: 'success',
          duration: 3000
        })
      } else {
        throw new Error('未找到生成的视频或图片')
      }
    } catch (error: any) {
      wx.hideLoading()
      console.error('生成视频失败:', error)
      let errorMsg = error.message || '生成失败，请重试'
      
      if (errorMsg.includes('token') || errorMsg.includes('Token') || errorMsg.includes('401') || errorMsg.includes('无效')) {
        wx.showModal({
          title: 'Token无效',
          content: errorMsg + '\n\n请重新登录获取新的Token',
          showCancel: false,
          confirmText: '去登录',
          success: () => {
            clearTokens()
            this.checkLoginStatus()
            this.goToLogin()
          }
        })
      } else if (errorMsg.includes('402') || errorMsg.includes('余额不足')) {
        wx.showModal({
          title: '余额不足',
          content: '星星余额不足，请充值后再试',
          showCancel: false
        })
      } else {
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

  // 预览视频
  previewVideo(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    const video = this.data.generatedVideos[index]
    if (!video || !video.url) {
      wx.showToast({
        title: '视频不存在',
        icon: 'none'
      })
      return
    }
    
    wx.previewMedia({
      sources: [{
        url: video.url,
        type: 'video'
      }],
      current: 0,
      success: () => {
        console.log('视频预览成功')
      },
      fail: (err) => {
        console.error('视频预览失败:', err)
        wx.showToast({
          title: '视频预览失败',
          icon: 'none'
        })
      }
    })
  },

  // 保存视频
  saveVideo(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    const video = this.data.generatedVideos[index]
    if (!video || !video.url) {
      wx.showToast({
        title: '没有可保存的视频',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '保存中...'
    })

    if (video.url.startsWith(wx.env.USER_DATA_PATH) || video.url.startsWith('/')) {
      wx.saveVideoToPhotosAlbum({
        filePath: video.url,
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
    } else if (video.url.startsWith('data:video')) {
      const base64 = video.url.split(',')[1] || video.url
      const fs = wx.getFileSystemManager()
      const filePath = `${wx.env.USER_DATA_PATH}/video_${Date.now()}_${index}.mp4`
      
      try {
        const arrayBuffer = wx.base64ToArrayBuffer(base64)
        fs.writeFileSync(filePath, arrayBuffer, 'binary')
        
        wx.saveVideoToPhotosAlbum({
          filePath: filePath,
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
      } catch (error) {
        wx.hideLoading()
        console.error('转换base64失败:', error)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    } else {
      wx.downloadFile({
        url: video.url,
        success: (res) => {
          if (res.statusCode === 200) {
            wx.saveVideoToPhotosAlbum({
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
    }
  },

  // 预览图片
  previewImage(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    const image = this.data.generatedImages[index]
    if (!image || !image.url) {
      wx.showToast({
        title: '图片不存在',
        icon: 'none'
      })
      return
    }
    
    wx.previewImage({
      urls: [image.url],
      current: image.url
    })
  },

  // 保存图片
  saveImage(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    const image = this.data.generatedImages[index]
    if (!image || !image.url) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '保存中...'
    })

    if (image.url.startsWith(wx.env.USER_DATA_PATH) || image.url.startsWith('/')) {
      wx.saveImageToPhotosAlbum({
        filePath: image.url,
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
    } else if (image.url.startsWith('data:image')) {
      const base64 = image.url.split(',')[1] || image.url
      const fs = wx.getFileSystemManager()
      const filePath = `${wx.env.USER_DATA_PATH}/image_${Date.now()}_${index}.png`
      
      try {
        const arrayBuffer = wx.base64ToArrayBuffer(base64)
        fs.writeFileSync(filePath, arrayBuffer, 'binary')
        
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
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
      } catch (error) {
        wx.hideLoading()
        console.error('转换base64失败:', error)
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        })
      }
    } else {
      wx.downloadFile({
        url: image.url,
        success: (res) => {
          if (res.statusCode === 200) {
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
    }
  },

  // 重新生成
  regenerate() {
    this.setData({
      generatedVideos: [],
      generatedImages: [],
      errorMessage: '',
      cost: '',
      balance: ''
    })
    this.onGenerate()
  },
  // 用户点击右上角转发按钮时触发
  onShareAppMessage(options: WechatMiniprogram.Page.IShareAppMessageOption) {
    const firstImage = this.data.generatedImages && this.data.generatedImages.length > 0 ? this.data.generatedImages[0].url : undefined
    const firstPreview = this.data.images && this.data.images.length > 0 ? this.data.images[0].preview : undefined
    return {
      title: '多图视频 - AI智能体，多张图片生成连续视频',
      path: '/pages/multi-image-video/multi-image-video',
      imageUrl: firstImage || firstPreview || undefined
    }
  },
  // 用户点击右上角分享到朋友圈按钮时触发
  onShareTimeline() {
    const firstImage = this.data.generatedImages && this.data.generatedImages.length > 0 ? this.data.generatedImages[0].url : undefined
    const firstPreview = this.data.images && this.data.images.length > 0 ? this.data.images[0].preview : undefined
    return {
      title: '多图视频 - AI智能体，多张图片生成连续视频',
      query: '',
      imageUrl: firstImage || firstPreview || undefined
    }
  }
})


