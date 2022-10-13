const crypto = require('crypto')

class Client {
  constructor(username, password) {
    this.username = username
    this.password = password
    this.active2fa = false
    this.salt = null
  }

  generateDerivedKey() {
    this.salt = crypto.randomBytes(64).toString('hex')
    this.username = crypto.scryptSync(this.username, this.salt, 64)
    this.password = this.encryptGCM(this.password, this.username, this.salt)
  }

  encryptGCM(password, username, salt) {
    const iv = crypto.pbkdf2Sync(username, salt, 100000, 32, 'sha512')
    const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512')
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([Buffer.from(salt, 'hex'), tag, encrypted])
  }

  generateNewClientRequest() {
    this.generateDerivedKey()
  }
}

module.exports = Client
