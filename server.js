const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const crypto = require('crypto')
const totp = require('totp-generator')
var base32 = require('hi-base32')

const userInfos = []

const registerNewClient = async (userInfo, callback) => {
  if (userInfos.some((info) => info.username === userInfo.username)) {
    return callback({
      status: `Error! Username: '${userInfo.username}' already exists!`,
    })
  }
  const scryptToken = scryptTokenGenerator(userInfo.generatedToken, userInfo.username)
  userInfo = { ...userInfo, scryptToken }
  userInfos.push(userInfo)
  console.log(`New client: ${userInfo.username} registered successfully!`)
  return callback({
    status: `Stored - New client: ${userInfo.username}`,
  })
}

const verifyScryptHash = async (clientInfo, callback) => {
  let derivedKey = null
  let foundIndex = null

  userInfos.map((val, index) => {
    if (val.username === clientInfo.username) {
      foundIndex = index
      return (derivedKey = val.scryptToken)
    }
  })

  if (!derivedKey) {
    callback({
      status: 'Error creating your 2FA: User not found!',
    })
    return console.log('User not found!')
  }

  const result = scryptTokenGenerator(clientInfo.generatedToken, clientInfo.username).toString('hex') === derivedKey.toString('hex')

  if (result === true) {
    const twoFactorToken = createTwoFactorToken(derivedKey.toString('hex'))
    userInfos[foundIndex] = { ...userInfos[foundIndex], twoFactorToken }
    callback({
      status: twoFactorToken,
    })
  }

  callback({
    status: 'Error creating your 2FA: Internal server error.',
  })
}

const createTwoFactorToken = (key) => {
  return totp(base32.encode(key), {
    algorithm: 'SHA-512',
    period: 60,
  })
}

const checkTwoFactorToken = (clientInfo, key, callback) => {
  let derivedTwoFactorKey = null
  let foundIndex = null

  userInfos.map((val, index) => {
    if (val.username === clientInfo.username) {
      foundIndex = index
      return (derivedTwoFactorKey = val.twoFactorToken)
    }
  })

  if (!derivedTwoFactorKey) {
    callback({
      status: 'ERROR! User not properly authenticated.',
    })
  }
  if (key === derivedTwoFactorKey) {
    userInfos[foundIndex] = { ...userInfos[foundIndex], authenticated: true }
    callback({
      status: 'Login Sucessful!',
    })
  }

  callback({
    status: 'Wrong T2A token. Verify it or generate a new one.',
  })
}

const scryptTokenGenerator = (keyFromClient, usernameAsSalt) => {
  return crypto.scryptSync(keyFromClient, usernameAsSalt, 24)
}

const checkMessageReceived = (clientInfo, message, key, socket, callback) => {
  const derivedKey = crypto.pbkdf2Sync(message, clientInfo.username, 100000, 64, 'sha512')
  let foundUser = null

  userInfos.map((val) => {
    if (val.username === clientInfo.username) {
      foundUser = val
    }
  })

  if (!foundUser) {
    callback({
      status: 'FAIL! User not found!',
    })
    return console.log(`ERROR! User '${clientInfo.username}' not found!`)
  }

  if (!foundUser.authenticated) {
    callback({
      status: 'FAIL! User not authenticated',
    })
    return console.log('ERROR! User not authenticated.')
  }

  if (key.toString('hex') === derivedKey.toString('hex')) {
    console.log(`Message received! Sending message back to: ${clientInfo.username}`)
    return socket.emit('serverMessage', message, derivedKey)
  }
  callback({
    status: 'FAIL',
  })
  return console.log(`Key from server '${derivedKey.toString('hex')}' differs from client key '${key.toString('hex')}'`)
}

io.on('connection', function (socket) {
  console.log('New connection established.')

  socket.on('newClient', function (userInfo, callback) {
    registerNewClient(userInfo, callback)
  })

  socket.on('login', function (userInfo, callback) {
    verifyScryptHash(userInfo, callback)
  })

  socket.on('2FAToken', function (userInfo, twoFactorKey, callback) {
    checkTwoFactorToken(userInfo, twoFactorKey, callback)
  })

  socket.on('clientMessage', function (userInfo, message, twoFactorKey, callback) {
    checkMessageReceived(userInfo, message, twoFactorKey, this, callback)
  })
})

http.listen(3000, function () {
  console.log('listening on localhost:3000')
})
