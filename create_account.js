const dsteem     = require('dsteem')
const fs         = require('fs')
const config     = JSON.parse(fs.readFileSync('./config.json'))
const client     = new dsteem.Client('https://api.steemit.com')
const active_key = dsteem.PrivateKey.fromString(config.active_key)
var utils        = require('./utils.js')

function randomSeed () {
	let randomNumber = ((1 - Math.random()) * new Date().getTime())
	return randomNumber.toFixed(0)
}

function calcLeftovers (leftovers_usd, op) {

}

async function createAccount(newAccount, op, leftovers, pubkey) {
	return new Promise(async (resolve, reject) => {
		//create keys for new account
		const ownerKey   = dsteem.PrivateKey.fromSeed(randomSeed(), 'owner')
		const activeKey  = dsteem.PrivateKey.fromSeed(randomSeed(), 'active')
		const postingKey = dsteem.PrivateKey.fromSeed(randomSeed(), 'posting')
		let memoKey      = dsteem.PrivateKey.fromSeed(randomSeed(), 'memo')

		// console.log(newAccount + ' ** Keys below **')
		// console.log(ownerKey.toString())
		// console.log(activeKey.toString())
		// console.log(postingKey.toString())
		// console.log(memoKey.toString())
		var keys = {ownerKey: ownerKey.toString(), activeKey: activeKey.toString(), postingKey: postingKey.toString(), memoKey: memoKey.toString()}
		//create auth values for passing to account creation
		const ownerAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[ownerKey.createPublic(), 1]],
		}
		const activeAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[activeKey.createPublic(), 1]],
		}
		const postingAuth = {
		    weight_threshold: 1,
		    account_auths: [],
		    key_auths: [[postingKey.createPublic(), 1]],
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
		        memo_key: memoKey.createPublic(),
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
				let memo = keys.stringify(keys)
                memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
                utils.log(memo)
                client.broadcast.transfer({ amount: leftovers, from: config.account, to: op.from, memo: memo}, active_key)				
				return resolve()
			})
			.catch((e) => reject(e))
		}
	})
}

module.exports = {
	createAccount: createAccount
}