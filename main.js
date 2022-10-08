const io = require('socket.io-client')
const fsExtra = require('fs-extra')
const crypto = require('crypto')

const Client = require('./client')

const socket = io.connect('http://localhost:3000', { reconnect: false, reconnectionAttempts: 10 })
const clients = []

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
3- Autenticação com token\n
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
  // 2: () => {
  //     readline.question('Informe o usuário do cliente a ser cadastrado no servidor.\n > ', username => {
  //         clients.map(client => {
  //             if (client.username === username) {
  //                 client.newClientSocket(socket)
  //                 return waitForUserInput()
  //             }
  //         })
  //         console.log('Usuario nao encontrado!')
  //         return waitForUserInput()
  //     })
  // },
  3: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      console.log('🚀 ~ file: main.js ~ line 78 ~ clients.map ~ clients', clients)
      clients.map((client) => {
        if (client.username === username) {
          client.clientLoginSocket(socket)
          return waitForUserInput()
        }
      })
      console.log('Usuario nao encontrado!')
      return waitForUserInput()
    })
  },

  4: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      let foundClient = null
      clients.map((client) => {
        if (client.username === username) {
          foundClient = client
        }
      })
      if (foundClient) {
        readline.question('Informe a chave 2FA recebida na autenticacao de token\n > ', (key) => {
          foundClient.checkTwoFactorAuthSocket(key, socket)
          return waitForUserInput()
        })
      }
      console.log('Usuario nao encontrado!')
      return waitForUserInput()
    })
  },
  //   5: () => {
  //     readline.question('Informe o usuário do cliente que deseja enviar mensagens.\n > ', (username) => {
  //       let foundClient = null
  //       clients.map((client) => {
  //         if (client.username === username) {
  //           foundClient = client
  //         }
  //       })
  //       if (foundClient) {
  //         readline.question('Informe a mensagem a ser enviada para o servidor\n > ', (message) => {
  //           return foundClient.clientSendMessage(foundClient, message, socket)
  //         })
  //       }
  //       console.log('Usuario nao encontrado!')
  //       return waitForUserInput()
  //     })
  //   },
  6: () => {
    console.log('Bye-bye!')
    readline.close()
    return process.exit()
  },
  7: () => {
    clients.map((client) => {
      console.log(client)
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
