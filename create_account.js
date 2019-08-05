const dsteem     = require('dsteem')
const fs         = require('fs')
const config     = JSON.parse(fs.readFileSync('./config.json'))
const client     = new dsteem.Client('https://api.steemit.com')
const active_key = dsteem.PrivateKey.fromString(config.active_key)
const steem      = require('steem');
var utils        = require('./utils.js')

let test = 'createaccount sdjjtt STM7UkRnx6h2oumyYCRBkZYaUZqikyjiFGFvJ8i5vKCnQmCRC8D8W STM7UkRnx6h2oumyYCRBkZYaUZqikyjiFGFvJ8i5vKCnQmCRC8D8W STM7UkRnx6h2oumyYCRBkZYaUZqikyjiFGFvJ8i5vKCnQmCRC8D8W STM7UkRnx6h2oumyYCRBkZYaUZqikyjiFGFvJ8i5vKCnQmCRC8D8W'
let testArr = test.split(' ')
console.log(testArr.length)
if (testArr.length != 6) {
	console.log('invalid !')
}
async function createAccount(wordsArray) {
	return new Promise(async (resolve, reject) => {
		let newAccount = wordsArray[1]
		//create keys for new account
		const ownerPubKey   = wordsArray[2]
		const activePubKey  = wordsArray[3]
		const postingPubKey = wordsArray[4]
		const memoPubKey    = wordsArray[5]

		const ownerAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[ownerPubKey, 1]],
		}
		const activeAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[activePubKey, 1]],
		}
		const postingAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[memoPubKey, 1]],
		}

		// then create discounted account operation
		const create_op = [
		    'create_claimed_account',
		    {
		        creator: config.account,
		        new_account_name: newAccount,
		        owner: ownerAuth,
		        active: activeAuth,
		        posting: postingAuth,
		        memo_key: memoPubKey,
		        json_metadata: '',
		        extensions: [],
		    }
		]

		//check if account exists       
		var _account = await client.database.call('get_accounts', [[newAccount]])
		//account not available to register
		if (_account.length > 0) {
			return reject('account name already taken')
		} else {
			utils.log('account is available')
			client.broadcast.sendOperations([create_op], active_key)
			.then((result) => {
				resolve()
			})
			.catch((e) => reject(e))
		}
	})
}

module.exports = {
	createAccount: createAccount
}