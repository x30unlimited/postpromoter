var assert = require('assert');
var fs     = require('fs');
var config = JSON.parse(fs.readFileSync("config.json"));
var steem  = require('steem');
var dsteem = require('dsteem');
var client = new dsteem.Client('https://anyx.io')
var pubkey = ''

describe('async client test:', () => {
	it('should request test account data', (done) => {
		client.database.call('get_accounts', [[config.test_account]])
		.then((res) => {
			assert.equal(config.test_account, res[0].name)
			pubkey = res[0].memo_key
			done()
		})
	})

	it('should encrypt and decript a memo', () => {
		let memo = '#this is just a test'
		let encrypted_memo = steem.memo.encode(config.memo_key, pubkey, memo)
		assert.equal(memo, steem.memo.decode(config.test_memo_key, encrypted_memo))
	})
})