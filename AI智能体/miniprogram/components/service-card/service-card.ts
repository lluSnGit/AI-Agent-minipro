Component({
  properties: {
    title: { type: String, value: '' },
    description: { type: String, value: '' },
    image: { type: String, value: '' }
  },
  methods: {
    onTap() {
      this.triggerEvent('tap')
    }
  }
})
