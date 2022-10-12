const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const { totp } = require('otplib')
const fsExtra = require('fs-extra')
const crypto = require('crypto')

const Client = require('./client')

const registerNewClient = async (client, callback) => {
  const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
  client.generateNewClientRequest()
  users.push(client)
  fsExtra.writeJson(
    './users.json',
    { users: users },
    {
      spaces: 2,
    },
    function (err) {
      if (err) callback('Falha ao cadastrar cliente!')
      callback('Novo cliente cadastrado!')
    }
  )
}

const verifyScryptHash = async (clientInfo, callback) => {
  if (!clientInfo.generatedToken) {
    callback({
      status: 'Error creating your 2FA',
    })
    return console.log('Error creating your 2FA')
  }

  const twoFactorToken = createTwoFactorToken(clientInfo.generatedToken)
  callback({
    status: twoFactorToken,
  })

  callback({
    status: 'Error creating your 2FA: Internal server error.',
  })
}

const createTwoFactorToken = (key) => {
  const buffer = Buffer.from(key)
  totp.options = { digits: 10, algorithm: 'sha512', step: 60 }
  return totp.generate(buffer.toString('hex'))
}

const checkTwoFactorToken = (clientInfo, key, callback) => {
  const buffer = Buffer.from(clientInfo.generatedToken)
  const match = totp.check(key, buffer.toString('hex'))
  if (match) {
    callback({
      status: 'Login Sucessful!',
    })
  }

  callback({
    status: 'Wrong T2A token. Verify it or generate a new one.',
  })
}

const checkUserAlreadyExists = (username, salt, buffer) => {
  const keyBuffer = Buffer.from(buffer, 'hex')
  const hashedBuffer = crypto.scryptSync(username, salt, 64)
  const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer)
  return match
}

const findUser = (username) => {
  const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
  return Object.assign(new Client(), {
    ...users.find((user) => checkUserAlreadyExists(username, user.salt, user.username)),
  })
}

const isNewUser = (userName, callback) => {
  const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
  const userNameAlreadyExists = users.some((user) => checkUserAlreadyExists(userName, user.salt, user.username))
  callback(userNameAlreadyExists)
}

const checkUserPassword = (buffer, hashedBuffer) => {
  const keyBuffer = Buffer.from(buffer, 'hex')
  if (keyBuffer.length === hashedBuffer.length) {
    const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer)
    return match
  }
  return false
}

const login = (userInfo, callback) => {
  const user = findUser(userInfo.username)
  if (!user.username) {
    console.log('cliente nao registrado')
    return waitForUserInput()
  }

  const hashedBuffer = user.encryptGCM(userInfo.password, Buffer.from(user.derivedKey.data), user.salt)
  callback(checkUserPassword(user.password, hashedBuffer))
}

io.on('connection', function (socket) {
  console.log('New connection established.')

  socket.on('checkIfUserAlreadyExists', function (userName, callback) {
    isNewUser(userName, callback)
  })

  socket.on('newClient', function (userInfo, callback) {
    registerNewClient(userInfo, callback)
  })

  socket.on('login', function (userInfo, callback) {
    login(userInfo, callback)
  })

  socket.on('generate2FAToken', function (userInfo, callback) {
    verifyScryptHash(userInfo, callback)
  })

  socket.on('2FAToken', function (userInfo, twoFactorKey, callback) {
    checkTwoFactorToken(userInfo, twoFactorKey, callback)
  })
})

http.listen(3000, function () {
  console.log('listening on localhost:3000')
})
