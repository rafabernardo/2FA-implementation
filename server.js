const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const { totp } = require('otplib')
const fsExtra = require('fs-extra')
const crypto = require('crypto')

const Client = require('./client')

const registerNewClient = async (user, callback) => {
  const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
  const client = new Client(user.username, user.password)
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

const verifyScryptHash = async (username, callback) => {
  const clientInfo = findUser(username)

  if (!clientInfo.username) {
    callback({
      status: 'Error ao procurar usuário',
    })
    return console.log('Error ao procurar usuário')
  }
  if (!clientInfo.derivedKey) {
    callback({
      status: 'Erro ao criar 2FA',
    })
    return console.log('Erro ao criar 2FA')
  }

  const twoFactorToken = createTwoFactorToken(clientInfo.derivedKey)
  if (twoFactorToken) {
    callback({
      token: twoFactorToken,
    })
    return
  }

  callback({
    status: 'Erro ao criar 2FA: Internal server error.',
  })
}

const createTwoFactorToken = (key) => {
  const buffer = Buffer.from(key)
  totp.options = { digits: 10, algorithm: 'sha512', step: 60 }
  return totp.generate(buffer.toString('hex'))
}

const checkTwoFactorToken = (username, key, callback) => {
  const user = findUser(username)
  if (!user.username) {
    callback({ status: 'Cliente nao registrado' })
    return
  }
  const buffer = Buffer.from(user.derivedKey)
  const match = totp.check(key, buffer.toString('hex'))
  if (match) {
    callback({
      status: 'Usuário Logado com sucesso!',
    })
  }

  callback({
    status: 'Token errado. Verifique ou gere um novo!',
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

const checkUserPassword = (buffer, password, derivedKey) => {
  const bData = Buffer.from(buffer, 'base64')
  const iv = bData.slice(64, 80)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(derivedKey.data), iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const keyBuffer = bData.slice(96)

  if (keyBuffer.length === encrypted.length) {
    const match = crypto.timingSafeEqual(encrypted, keyBuffer)
    return match
  }
  return false
}

const login = (userInfo, callback) => {
  const user = findUser(userInfo.username)
  if (!user.username) {
    callback({ status: 'Cliente não registrado' })
    return
  }

  if (checkUserPassword(user.password, userInfo.password, user.derivedKey)) {
    callback({ status: 'Usuário Logado com sucesso!' })
    return
  }

  callback({ status: 'Falha ao logar usuario!' })
}

io.on('connection', function (socket) {
  console.log('Nova conexão estabelecida')

  socket.on('checkIfUserAlreadyExists', function (userName, callback) {
    isNewUser(userName, callback)
  })

  socket.on('newClient', function (userInfo, callback) {
    registerNewClient(userInfo, callback)
  })

  socket.on('login', function (userInfo, callback) {
    login(userInfo, callback)
  })

  socket.on('generate2FAToken', function (username, callback) {
    verifyScryptHash(username, callback)
  })

  socket.on('2FAToken', function (username, twoFactorKey, callback) {
    checkTwoFactorToken(username, twoFactorKey, callback)
  })
})

http.listen(3000, function () {
  console.log('listening on localhost:3000')
})
