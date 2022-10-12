const crypto = require('crypto')
const fsExtra = require('fs-extra')

class Client {
  constructor(username, password) {
    this.username = username
    this.password = password
    this.derivedKey = null
    this.salt = null
  }

  generateDerivedKey() {
    if (this.derivedKey) {
      return console.log('Key already generated.')
    }
    this.salt = crypto.randomBytes(12).toString('hex')
    this.username = crypto.scryptSync(this.username, this.salt, 64)
    this.derivedKey = crypto.pbkdf2Sync(this.password, this.salt, 100000, 32, 'sha512')
    this.password = this.encryptGCM(this.password, this.derivedKey, this.salt)
  }

  getCurrentTime() {
    return new Date()
  }

  encryptGCM(password, derivedKey, salt) {
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, salt)
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    return encrypted
  }

  generateNewClientRequest() {
    if (!this.derivedKey) {
      this.generateDerivedKey()
    }

    return {
      username: this.username,
      generatedToken: this.derivedKey,
      currentTime: this.getCurrentTime(),
    }
  }

  // newClientSocket = async (socket) => {
  //   socket.emit('newClient', this.generateNewClientRequest(), (response) => {
  //     console.log(response)
  //     return response
  //   })
  // }

  clientLoginSocket = async (socket) => {
    socket.emit('login', this.generateNewClientRequest(), (response) => {
      console.log(response.status)
    })
  }

  checkTwoFactorAuthSocket = async (key, socket) => {
    socket.emit('2FAToken', this.generateNewClientRequest(), key, (response) => {
      console.log(response)
    })
  }

  registerUser(client, socket) {
    socket.emit('newClient', client, (response) => {
      console.log(response)
    })
  }
}

module.exports = Client
