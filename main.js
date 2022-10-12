const io = require('socket.io-client')
const fsExtra = require('fs-extra')
const crypto = require('crypto')

const Client = require('./client')

const socket = io.connect('http://localhost:3000', { reconnect: false, reconnectionAttempts: 10 })

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
})

const checkUserAlreadyExists = (username, salt, buffer) => {
  const keyBuffer = Buffer.from(buffer, 'hex')
  const hashedBuffer = crypto.scryptSync(username, salt, 64)
  const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer)
  return match
}

const checkUserPassword = (buffer, hashedBuffer) => {
  const keyBuffer = Buffer.from(buffer, 'hex')
  if (keyBuffer.length === hashedBuffer.length) {
    const match = crypto.timingSafeEqual(hashedBuffer, keyBuffer)
    return match
  }
  return false
}

socket.on('connect_error', function (err) {
  console.log('Falha de conexao')
  console.log(err)
})

socket.on('connect', function () {
  console.log('Conexao estabelecida.')
})

const readLineMenu = `------MENU------\n
Opcoes:\n
1- Cadastrar cliente\n
2- Autenticacao com senha\n
3- Gerar token 2FA\n
4- Autenticação 2FA\n
6- Sair do programa \n
7- Listar clientes - DEBUG \n
----------------- \n
> `

const options = {
  1: () => {
    let tempUser = null
    let tempPass = null
    readline.question('Qual o usuario do novo cliente?\n > ', (username) => {
      const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
      if (users.some((user) => checkUserAlreadyExists(username, user.salt, user.username))) {
        console.log('cliente ja registrado')
        return waitForUserInput()
      }

      tempUser = username
      readline.question('Qual a senha do novo cliente?\n >', (password) => {
        tempPass = password
        if (tempUser.trim() !== '' && tempPass.trim() !== '') {
          const client = new Client(tempUser, tempPass)
          client.registerUser(client)
          console.log('Novo cliente cadastrado')
          return waitForUserInput()
        }
        console.log('Erro! A senha ou usuário do cliente nao pode estar vazia!')
        return waitForUserInput()
      })
    })
  },
  2: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      readline.question('Qual a senha do novo cliente?\n >', (password) => {
        const user = findUser(username)
        if (!user.username) {
          console.log('cliente nao registrado')
          return waitForUserInput()
        }

        const hashedBuffer = user.encryptGCM(password, Buffer.from(user.derivedKey.data), user.salt)
        if (checkUserPassword(user.password, hashedBuffer)) {
          console.log('Login Sucessful!')
          return waitForUserInput()
        }

        console.log('Erro! A senha ou usuário estao erradas!')
        return waitForUserInput()
      })
    })
  },
  3: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      const user = findUser(username)
      if (user.username) {
        user.clientLoginSocket(socket)
        return waitForUserInput()
      }
      console.log('Usuario nao encontrado!')
      return waitForUserInput()
    })
  },

  4: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      const user = findUser(username)
      if (user.username) {
        readline.question('Informe a chave 2FA recebida na autenticacao de token\n > ', (key) => {
          user.checkTwoFactorAuthSocket(key, socket)
          return waitForUserInput()
        })
      }
      console.log('Usuario nao encontrado!')
      return waitForUserInput()
    })
  },
  6: () => {
    console.log('Bye-bye!')
    readline.close()
    return process.exit()
  },
  7: () => {
    const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
    users.map((user) => {
      console.log(user)
    })
    return waitForUserInput()
  },
}

const waitForUserInput = () => {
  readline.question(readLineMenu, (option) => {
    if (options[option]) {
      options[option]()
      return waitForUserInput()
    }
    console.log('Opcao nao encontrada.')
    return waitForUserInput()
  })
}

waitForUserInput()

function findUser(username){
  const { users } = JSON.parse(fsExtra.readFileSync('./users.json', 'utf-8'))
  return Object.assign(new Client(), {
  ...users.find((user) => checkUserAlreadyExists(username, user.salt, user.username)),
  })    
}