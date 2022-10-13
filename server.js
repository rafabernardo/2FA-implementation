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

    return
  }

  if (!clientInfo.active2fa) {
    callback({
      status: 'Cliente não possui autenticação 2FA habilitada',
    })

    return
  }

  const derivedKey = crypto.pbkdf2Sync(clientInfo.password.toString('hex'), clientInfo.salt, 100000, 32, 'sha512')
  const twoFactorToken = createTwoFactorToken(derivedKey)

  if (twoFactorToken) {
    callback({
      status: 'Token gerado com sucesso',
      token: twoFactorToken,
    })
  }

  callback({
    status: 'Erro ao criar 2FA: Internal server error.',
  })
}

const createTwoFactorToken = (key) => {
  totp.options = { digits: 10, algorithm: 'sha512', step: 60 }
  return totp.generate(key.toString('hex'))
}

const change2FAStatus = async (userStatusInfo, callback) => {
  let { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))

  let user = users.find((user) => checkUserAlreadyExists(userStatusInfo.username, user.salt, user.username))

  users = users.map((el) => {
    if (el.username === user.username) {
      return { ...el, active2fa: userStatusInfo.status }
    }

    return el
  })

  fsExtra.writeJson(
    './users.json',
    { users: users },
    {
      spaces: 2,
    },
    function (err) {
      if (err) callback('Falha ao atualizar status de 2FA!')
      callback('Status de 2FA alterado!')
    }
  )
}

const checkTwoFactorToken = (username, key, callback) => {
  const user = findUser(username)

  if (!user.username) {
    callback({ status: 'Cliente nao registrado' })
    return
  }

  if (!user.active2fa) {
    callback({ status: 'Cliente não possui autenticação 2FA habilitada' })
    return
  }

  const derivedKey = crypto.pbkdf2Sync(user.password.toString('hex'), user.salt, 100000, 32, 'sha512')
  const match = totp.check(key, derivedKey.toString('hex'))
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

const checkUserPassword = (buffer, username, password, salt) => {
  const iv = crypto.pbkdf2Sync(Buffer.from(username, 'hex'), salt, 100000, 32, 'sha512')
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512')
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const encryptedBuffer = Buffer.concat([Buffer.from(salt, 'hex'), tag, encrypted])

  if (Buffer.from(buffer, 'hex').length === encryptedBuffer.length) {
    const match = crypto.timingSafeEqual(encryptedBuffer, Buffer.from(buffer, 'hex'))
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

  if (checkUserPassword(user.password, user.username, userInfo.password, user.salt)) {
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

  socket.on('2FAToken', function (username, key, callback) {
    checkTwoFactorToken(username, key, callback)
  })

  socket.on('change2FAStatus', function (userStatusInfo, callback) {
    change2FAStatus(userStatusInfo, callback)
  })
})

http.listen(3000, function () {
  console.log('listening on localhost:3000')
})
