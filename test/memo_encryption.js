var assert = require('chai').assert;
var expect = require('chai').expect;
var fs     = require('fs');
var config = JSON.parse(fs.readFileSync("config.json"));
var steem  = require('steem');
var dsteem = require('dsteem');
var client = new dsteem.Client('https://anyx.io')
var fs     = require('fs')
var config = JSON.parse(fs.readFileSync("./config.json"))
var chalk  = require('chalk')

const min_vp = 5000

console.log(chalk.bgWhite('testing with account: @' + config.test_account))

function wait (seconds) {
	console.log(chalk.bgMagenta('waiting ' + seconds/1000 + ' seconds'))
	return new Promise((resolve, reject) => {
		setTimeout(() => {resolve()}, seconds)
	})
}

// Postpromoter initialisation
require('../postpromoter.js')

setTimeout(function() {

  describe('my suite', function() {

		describe('async client test and memo encryption/decryption:', function () {
			var bidhistory      = []
			var test_account    = []
			var amount1         = '0.003 STEEM'
			var amount2			= '0.004 STEEM'
			var memo1           = '#this is just a test ' + Date.parse(new Date())
			var memo2           = '#reverse https://steemit.com/@null/this-is-a-test-post-' + Date.parse(new Date())
			var memo3 			= '#https://steemit.com/'
			var memo4           = ''
			var memo1_encrypted, memo2_encrypted, memo3_encrypted, memo4_encrypted = ''
			var op1 ,op2, op3, op4 = []
			var test_post		= ''
			var decrypt_num     = 0
			var comment_history = []
			var last_post		= ''
			var vp              = 10000
			var already_voted   = false
			var expected_memo1_response = '#' + config.transfer_memos['below_min_bid']
			expected_memo1_response = expected_memo1_response.replace(/{amount}/g, amount1)
			expected_memo1_response = expected_memo1_response.replace(/{min_bid}/g, config.min_bid)
			var expected_memo2_response = '#' + config.transfer_memos['reversal_not_found']
			expected_memo2_response = expected_memo2_response.replace(/{postURL}/g, memo2.split(' ')[1]);
			var expected_leftover = Math.random()
			console.log(chalk.bold.bgGreen('memo1 ' + memo1))
			console.log(chalk.bold.bgGreen('memo2 ' + memo2))
			// console.log('memo3 ' + memo3)
			console.log(chalk.bold.bgYellow('expected_memo1_response ' + expected_memo1_response))
			console.log(chalk.bold.bgYellow('expected_memo2_response ' + expected_memo2_response))
			before(async function() {
				
				// check if already existing test post
				test_account    = await client.database.call('get_accounts', [[config.test_account]])
				let test_memo_pubkey   = test_account[0].memo_key
				comment_history = await client.database.call('get_account_history', [config.test_account, -1, 50])
				comment_history = comment_history.filter((x) => x[1].op[0] == 'comment' && x[1].op[1].author == config.test_account).map((x) => x[1].op[1])
				last_post       = comment_history[comment_history.length -1]

				if (last_post && last_post.permlink.indexOf('postpromoter') > -1) {
					console.log(chalk.italic.blue('there is already an existing testing post => ' + last_post.permlink))
					test_post = {author: config.test_account, permlink: last_post.permlink, parent_permlink: 'steemium', parent_author: '', body: 'testing the postpromoter steemium fork', json_metadata: JSON.stringify({app: 'steemium postpromoter fork'}), title: 'postpromoter-steemium-fork-test-' + Date.parse(new Date())}
					
					let content = await client.database.call('get_content', [last_post.author, last_post.permlink])
					if (content.active_votes.filter((x) => x.voter == config.account && x.weigth > 0).length > 0) {
						console.log(chalk.italic.blue('test post has already a vote from main account @' + config.account))
						already_voted = true
					}else {
						console.log(chalk.italic.blue('test post is not voted yet'))
						// this.skip()
					}
					let account = await client.database.call('get_accounts', [[config.account]])
					vp = account[0].voting_power
				} else {
					test_post                         = {author: config.test_account, permlink: 'postpromoter-steemium-fork-test-' + Date.parse(new Date()), parent_permlink: 'steemium', parent_author: '', body: 'testing the postpromoter steemium fork', json_metadata: JSON.stringify({app: 'steemium postpromoter fork'}), title: 'postpromoter-steemium-fork-test-' + Date.parse(new Date())}
					let wait_for_comment_confirmation = await client.broadcast.comment(test_post, dsteem.PrivateKey.fromString(config.test_active_key))
				}	
				memo3 = memo3 + '@' + test_post.author + '/' + test_post.permlink
				memo4 = '#reverse ' + 'https://steemit.com/@' + test_post.author + '/' + test_post.permlink

				memo1_encrypted = steem.memo.encode(config.memo_key, test_memo_pubkey, memo1)
				memo2_encrypted = steem.memo.encode(config.memo_key, test_memo_pubkey, memo2)
				memo3_encrypted = steem.memo.encode(config.memo_key, test_memo_pubkey, memo3)
				memo4_encrypted = steem.memo.encode(config.memo_key, test_memo_pubkey, memo4)

				op1 = { amount: amount1, from: config.test_account, to: config.account, memo: memo1_encrypted }
				op2 = { amount: amount2, from: config.test_account, to: config.account, memo: memo2_encrypted }
				op3 = { amount: (parseFloat(config.min_bid).toFixed(3) + ' STEEM'), from: config.test_account, to: config.account, memo: memo3_encrypted}
				op4 = { amount: (parseFloat(config.reversal_price * config.min_bid + expected_leftover).toFixed(3) + ' STEEM'), from: config.test_account, to: config.account, memo: memo4_encrypted}
			  console.log(chalk.green('amount4 = ' + parseFloat(config.reversal_price * config.min_bid + expected_leftover).toFixed(3)))
			})
			it('should encrypt and decript a memo', () => {
				assert.equal(memo1, steem.memo.decode(config.test_memo_key, memo1_encrypted))
			})
			it('should send a below min_bid and a reversal request from test account, both with encrypted memos', function (done) {
				// PP WORKS ONLY WITH OPS WITH TRX_ID, VIRTUAL OPS HAVE NO TRX_ID AND THEREFORE ARE IGNORED BY PP
				client.broadcast.transfer(op1, dsteem.PrivateKey.fromString(config.test_active_key))
				.then((res) => {
					client.broadcast.transfer(op2, dsteem.PrivateKey.fromString(config.test_active_key))
					.then(async(res) => {
						done()
					})
				})
			})
			it('should request via steem rpc node the trx history of test account', async function () {
				bidhistory = await client.database.call('get_account_history', [config.test_account, -1, 50])
				expect(bidhistory).to.have.length(51)
			})
			it ('should decrypt at least two transfer memos', async function () {
				this.retries(5)
				await wait(15000)
				bidhistory = await client.database.call('get_account_history', [config.test_account, -1, 4])
				// console.log(bidhistory)
				bidhistory = bidhistory.map((x) => x[1].op[1])
				// console.log(bidhistory)
				bidhistory.forEach((bid) => {
					if (bid.memo && bid.memo.startsWith('#')) {
						bid.memo = steem.memo.decode(config.test_memo_key, bid.memo)
						decrypt_num++
					}
				})
				// console.log(bidhistory)
				expect(decrypt_num).to.be.least(2)
			})
			it('should find the under min-bid encrypted bid transfer', async function () {
				this.retries(5)
				await wait(15000)
				bidhistory = await client.database.call('get_account_history', [config.test_account, -1, 10])
				bidhistory = bidhistory.map((x) => x[1].op[1])
				bidhistory.forEach((op) => {
					if (op.memo && op.memo.startsWith('#')) {
						op.memo = steem.memo.decode(config.test_memo_key, op.memo)
					}
				})
			    console.log(bidhistory.map((op) => op.memo))
			    console.log(chalk.underline.red('should match: ' + memo1))
				bidhistory = bidhistory.filter((op) => op.memo == memo1 && op.from == config.test_account)
				expect(bidhistory).to.have.length(1)
			})
			it('should find the reversal transfer', async function () {
				this.retries(5)
				await wait(10000)
				bidhistory = await client.database.call('get_account_history', [config.test_account, -1, 10])
				bidhistory = bidhistory.map((x) => x[1].op[1])
				bidhistory.forEach((op) => {
					if (op.memo && op.memo.startsWith('#')) {
						op.memo = steem.memo.decode(config.test_memo_key, op.memo)
					}
				})
			    console.log(bidhistory.map((op) => op.memo))
			    console.log(chalk.underline.red('should match: ' + memo2))
				bidhistory = bidhistory.filter((op) => op.memo == memo2 && op.from == config.test_account)
				expect(bidhistory).to.have.length(1)
			})
			it('should find the under min-bid encrypted bid refund', async function () {
				this.retries(5)
				await wait(15000)
				bidhistory = await client.database.call('get_account_history', [config.test_account, -1, 10])
				bidhistory = bidhistory.map((x) => x[1].op[1])
				bidhistory.forEach((op) => {
					if (op.memo && op.memo.startsWith('#')) {
						op.memo = steem.memo.decode(config.test_memo_key, op.memo)
					}
				})
			    console.log(bidhistory.map((op) => op.memo))
			    console.log(chalk.underline.red('should match: ' + expected_memo1_response))
				bidhistory = bidhistory.filter((op) => op.memo == expected_memo1_response && op.from == config.account)
				expect(bidhistory.length).to.be.least(1)
			})
			it('should find the reversal request refund', async function () {
				this.retries(5)
				await wait(10000)
				bidhistory = await client.database.call('get_account_history', [config.test_account, -1, 10])
				bidhistory = bidhistory.map((x) => x[1].op[1])
				bidhistory.forEach((op) => {
					if (op.memo && op.memo.startsWith('#')) {
						op.memo = steem.memo.decode(config.test_memo_key, op.memo)
					}
				})
			    console.log(bidhistory.map((op) => op.memo))
			    console.log(chalk.underline.red('should match: ' + expected_memo2_response))
				bidhistory = bidhistory.filter((op) => op.memo == expected_memo2_response && op.from == config.account)
				expect(bidhistory).to.have.length(1)
			})
			it('should bid on the test post for the min-bid amount', function (done) {
				if (already_voted) {
					// console.log(chalk.italic.red(config.account + ' has already casted a vote on test post'))
					this.skip()					
				}
				if (vp < min_vp) {
					console.log(chalk.italic.red('VP too low, try again once account @' + config.account + ' is at 100% VP'))
					this.skip()
				}
				client.broadcast.transfer(op3, dsteem.PrivateKey.fromString(config.test_active_key))
				.then(async(res) => {
					done()
				})
			})
			it ('should request a reversal for the last min-bid vote via encrypted memo', function (done) {
				client.broadcast.transfer(op4, dsteem.PrivateKey.fromString(config.test_active_key))
				.then(async(res) => {
					done()
				})
			})
		}) 
  });

  run();
}, 5000);
