type Key =
  | 'KeyW'
  | 'KeyA'
  | 'KeyS'
  | 'KeyD'
  | 'ShiftLeft'
  | 'Space'
  | 'KeyE'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Numpad1'
  | 'Numpad2'
  | 'Numpad3'

export class Input {
  private keys = new Set<string>()
  private keyDownOnce = new Set<string>()
  private mouseDx = 0
  private mouseDy = 0
  private isRmbDown = false

  attach(target: HTMLElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement
      const tag = el instanceof HTMLElement ? el.tagName : ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el instanceof HTMLElement && el.isContentEditable)) return
      if (!this.keys.has(e.code)) this.keyDownOnce.add(e.code)
      this.keys.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code)
    }
    const onBlur = () => {
      this.keys.clear()
      this.keyDownOnce.clear()
      this.mouseDx = 0
      this.mouseDy = 0
      this.isRmbDown = false
    }

    const onContextMenu = (e: MouseEvent) => {
      if (this.isRmbDown) e.preventDefault()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) this.isRmbDown = true
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) this.isRmbDown = false
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!this.isRmbDown) return
      this.mouseDx += e.movementX
      this.mouseDy += e.movementY
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    target.addEventListener('contextmenu', onContextMenu)
    target.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      target.removeEventListener('contextmenu', onContextMenu)
      target.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }

  isDown(code: Key) {
    return this.keys.has(code)
  }

  consumePressed(code: Key) {
    const had = this.keyDownOnce.has(code)
    this.keyDownOnce.delete(code)
    return had
  }

  consumeMouseDelta() {
    const dx = this.mouseDx
    const dy = this.mouseDy
    this.mouseDx = 0
    this.mouseDy = 0
    return { dx, dy, dragging: this.isRmbDown }
  }
}

