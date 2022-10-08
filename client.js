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
    this.salt = crypto.randomBytes(64).toString('hex')
    this.username = crypto.scryptSync(this.username, this.salt, 64)
    this.derivedKey = crypto.pbkdf2Sync(this.password, this.salt, 100000, 64, 'sha512')
    // this.password = ''
  }

  getCurrentTime() {
    return new Date()
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

  newClientSocket = async (socket) => {
    socket.emit('newClient', this.generateNewClientRequest(), (response) => {
      console.log(response)
    })
  }

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

  clientSendMessage = async (client, message, socket) => {
    const derivedKey = crypto.pbkdf2Sync(message, this.username, 100000, 64, 'sha512')

    socket.emit('clientMessage', this.generateNewClientRequest(), message, derivedKey, (response) => {
      return console.log(response.status)
    })

    socket.on('serverMessage', function (serverMessage, twoFactorKey) {
      if (twoFactorKey.toString('hex') === derivedKey.toString('hex')) {
        console.log('Message from server received! Sending message back.')
        return client.clientSendMessage(client, serverMessage, this)
      }
      return console.log(`Key from server '${derivedKey.toString('hex')}' differs from client key '${twoFactorKey.toString('hex')}'`)
    })
  }

  registerUser(user) {
    const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
    console.log('🚀 ~ file: client.js ~ line 71 ~ Client ~ registerUser ~ users', users)
    user.generateNewClientRequest()
    console.log('🚀 ~ file: client.js ~ line 72 ~ Client ~ registerUser ~ user', user)
    users.push(user)
    fsExtra.writeJson(
      './users.json',
      { users: users },
      {
        spaces: 2,
      },
      function (err) {
        if (err) throw err
        console.log('Updated!')
      }
    )
  }
}

module.exports = Client
