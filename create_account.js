const dsteem     = require('dsteem')
const fs         = require('fs')
const config     = JSON.parse(fs.readFileSync('./config.json'))
const client     = new dsteem.Client('https://api.steemit.com')
const active_key = dsteem.PrivateKey.fromString(config.active_key)
const steem      = require('steem');
var utils        = require('./utils.js')

async function createAccount(wordsArray) {
	return new Promise(async (resolve, reject) => {
		let newAccount = wordsArray[1]
		//create keys for new account
		const ownerKey   = dsteem.PublicKey.fromString(wordsArray[2])
		const activeKey  = dsteem.PublicKey.fromString(wordsArray[3])
		const postingKey = dsteem.PublicKey.fromString(wordsArray[4])
		const memoKey    = dsteem.PublicKey.fromString(wordsArray[5])

		const ownerAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[ownerKey, 1]],
		}
		const activeAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[activeKey, 1]],
		}
		const postingAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[postingKey, 1]],
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
		        memo_key: memoKey,
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