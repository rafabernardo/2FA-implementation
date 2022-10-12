const app = require('express')()
const http = require('http').Server(app)
const io = require('socket.io')(http)
const { totp } = require('otplib')
const fsExtra = require('fs-extra')
const crypto = require('crypto')

const registerNewClient = async (userInfo, callback) => {
  // if (userInfos.some((info) => info.username === userInfo.username)) {
  //   return callback({
  //     status: `Error! Username: '${userInfo.username}' already exists!`,
  //   })
  // }
  // const scryptToken = scryptTokenGenerator(userInfo.generatedToken, userInfo.username)
  // userInfo = { ...userInfo, scryptToken }
  // userInfos.push(userInfo)
  // console.log(`New client: ${userInfo.username} registered successfully!`)
  // return callback({
  //   status: `Stored - New client: ${userInfo.username}`,
  // })
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

const isNewUser = (userName, callback) => {
  const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
  const userNameAlreadyExists = users.some((user) => checkUserAlreadyExists(userName, user.salt, user.username))
  callback(userNameAlreadyExists)
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
    verifyScryptHash(userInfo, callback)
  })

  socket.on('2FAToken', function (userInfo, twoFactorKey, callback) {
    checkTwoFactorToken(userInfo, twoFactorKey, callback)
  })
})

http.listen(3000, function () {
  console.log('listening on localhost:3000')
})
