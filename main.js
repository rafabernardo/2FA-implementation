const io = require('socket.io-client')
const fsExtra = require('fs-extra')

const socket = io.connect('http://localhost:3000', { reconnect: false, reconnectionAttempts: 10 })

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
})

socket.on('connect_error', function (err) {
  console.log('Falha de conexao')
  console.log(err)
})

socket.on('connect', function () {
  console.log('Conexao estabelecida.')
})

checkIfUserAlreadyExists = async (username) => {
  return await new Promise((resolve) => {
    socket.emit('checkIfUserAlreadyExists', username, (answer) => {
      resolve(answer)
    })
  })
}

const readLineMenu = `------MENU------\n
Opcoes:\n
1- Cadastrar cliente\n
2- Autenticacao com senha\n
3- Gerar token 2FA\n
4- Autenticação 2FA\n
5- Sair do programa \n
6- Listar clientes - DEBUG \n
----------------- \n
> `

const options = {
  1: () => {
    readline.question('Qual o usuario do novo cliente?\n > ', async (username) => {
      const userExists = await checkIfUserAlreadyExists(username)
      if (userExists) {
        console.log('Cliente ja registrado\n')
        return waitForUserInput()
      }
      readline.question('Qual a senha do novo cliente?\n >', async (password) => {
        if (username.trim() !== '' && password.trim() !== '') {
          const response = await new Promise((resolve) => {
            socket.emit('newClient', { username, password }, (answer) => {
              resolve(answer)
            })
          })
          console.log(`${response} \n`)
          return waitForUserInput()
        }
        console.log('Erro! A senha ou usuário do cliente nao pode estar vazia!\n')
        return waitForUserInput()
      })
    })
  },
  2: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      readline.question('Qual a senha do cliente?\n >', async (password) => {
        const { status } = await new Promise((resolve) => {
          socket.emit('login', { username, password }, (answer) => {
            resolve(answer)
          })
        })
        console.log(status)
        return waitForUserInput()
      })
    })
  },
  3: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', async (username) => {
      const { token } = await new Promise((resolve) => {
        socket.emit('generate2FAToken', username, (answer) => {
          resolve(answer)
        })
      })
      if (token) {
        console.log(`Token: ${token}\n`)
      }
      return waitForUserInput()
    })
  },

  4: () => {
    readline.question('Informe o usuário do cliente a ser logado no servidor.\n > ', (username) => {
      readline.question('Qual a senha do cliente?\n >', async (password) => {
        const { status } = await new Promise((resolve) => {
          socket.emit('login', { username, password }, (answer) => {
            resolve(answer)
          })
        })
        if (status === 'Usuário Logado com sucesso!') {
          readline.question('Informe a chave 2FA recebida na autenticacao de token\n > ', async (key) => {
            const { status } = await new Promise((resolve) => {
              socket.emit('2FAToken', username, key, (answer) => {
                resolve(answer)
              })
            })
            console.log(status)
            return waitForUserInput()
          })
        }
        console.log(status)
        return waitForUserInput()
      })
    })
  },
  5: () => {
    console.log('Bye-bye!')
    readline.close()
    return process.exit()
  },
  6: () => {
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
