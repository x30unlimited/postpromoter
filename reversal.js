var steem  = require('steem')
var dsteem = require('dsteem')
var utils  = require('./utils.js');
var fs     = require('fs');
var config = JSON.parse(fs.readFileSync("config.json"));
var client = new dsteem.Client('https://anyx.io')

function checkAmount(bid_transfer, reversal_transfer, reversal_price, steem_price, sbd_price, pubkey) {

  let bid_amount       = parseFloat(bid_transfer.amount)
  let bid_currency      = utils.getCurrency(bid_transfer.amount)
  let reversal_amount  = parseFloat(reversal_transfer.amount)
  let reversal_currency = utils.getCurrency(reversal_transfer.amount)
  
  let bid_usd         = bid_currency == 'STEEM' ? bid_amount * steem_price : bid_amount * sbd_price
  let reversal_usd    = reversal_currency == 'STEEM' ? reversal_amount * steem_price : reversal_amount * sbd_price
  let _reversal_price = bid_usd * reversal_price
  let leftovers_usd   = reversal_usd - _reversal_price

  return leftovers_usd
}

function reverseVote(vote_to_reverse, leftovers_usd, pubkey, reversal_transfer, steem_price, sbd_price, retries) {
  return new Promise(async (resolve, reject) => {
    let postURL  = vote_to_reverse.memo.startsWith('#') ? vote_to_reverse.memo.substring(1) : vote_to_reverse.memo
    let permlink = postURL.substr(postURL.lastIndexOf('/') + 1)
    const vote   = {
      'voter': config.account,
      'author': vote_to_reverse.from,
      'permlink': permlink,
      'weight': 0
    }
    // console.log(vote)
    try { 
      await client.broadcast.vote(vote, dsteem.PrivateKey.fromString(config.posting_key))
    } catch(e) {
      console.log(err)
      utils.log('Error reversing vote for: @' + vote_to_reverse.from + permlink);
      let already_reversed_err = 'itr->vote_percent != o.weight: Your current vote on this comment is identical to this vote.'
      if (err = already_reversed_err) {
        let memo    = config.transfer_memos['already_reversed']
        memo        = memo.replace(/{postURL}/g, postURL)
        utils.log(memo)
        if (pubkey.length > 0) memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
        return client.broadcast.transfer({ amount: reversal_transfer.amount, from: config.account, to: reversal_transfer.from , memo: memo}, dsteem.PrivateKey.fromString(config.active_key))
      }
      // Try again on error
      if(retries < 2) return setTimeout(() => { reverseVote(vote_to_reverse, retries + 1); }, 10000);
      else return reject(err)        
    }
    utils.log('Vote reversed for: @' + vote_to_reverse.from + permlink);
    // if no leftovers we close here
    if (leftovers_usd == 0) return resolve()
    // send leftovers back
    let currency = utils.getCurrency(reversal_transfer.amount)
    let leftovers = (currency == 'STEEM') ? leftovers_usd / steem_price : leftovers_usd / sbd_price
    leftovers = parseFloat(leftovers).toFixed(3) + ' ' + currency
    let memo = config.transfer_memos['reversal_leftovers']
    memo = memo.replace(/{postURL}/g, postURL);
    utils.log(memo)
    if (pubkey.length > 0) memo = steem.memo.encode(config.memo_key, pubkey, ('#' + memo))
    client.broadcast.transfer({ amount: leftovers, from: config.account, to: reversal_transfer.from, memo: memo}, dsteem.PrivateKey.fromString(config.active_key))
    return resolve() 
  })
}

module.exports = {
  checkAmount: checkAmount,
  reverseVote: reverseVote
}